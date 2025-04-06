package opns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/4chain-ag/go-overlay-services/pkg/core/engine"
	"github.com/b-open-io/bsv21-overlay/lookups/events"
	"github.com/bitcoin-sv/go-templates/template/inscription"
	"github.com/bitcoin-sv/go-templates/template/ordlock"
	"github.com/bsv-blockchain/go-sdk/overlay"
	"github.com/bsv-blockchain/go-sdk/overlay/lookup"
	"github.com/bsv-blockchain/go-sdk/script"
	"github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/template/p2pkh"
	"github.com/redis/go-redis/v9"
)

type JoinType int

var (
	JoinTypeIntersect  JoinType = 0
	JoinTypeUnion      JoinType = 1
	JoinTypeDifference JoinType = 2
)

type BlockPos struct {
	Height uint32 `json:"height"`
	Idx    uint64 `json:"idx"`
}
type Question struct {
	Event    string    `json:"event"`
	Events   []string  `json:"events"`
	JoinType *JoinType `json:"join"`
	From     BlockPos  `json:"from"`
	Limit    int       `json:"limit"`
	Spent    *bool     `json:"spent"`
	Reverse  bool      `json:"rev"`
}

type LookupService struct {
	db      *redis.Client
	storage engine.Storage
	topic   string
}

func EventKey(event string) string {
	return "ev:" + event
}

func OutpointEventsKey(outpoint *overlay.Outpoint) string {
	return "oe:" + outpoint.String()
}

func NewLookupService(connString string, storage engine.Storage, topic string) (*LookupService, error) {
	r := &LookupService{
		storage: storage,
		topic:   topic,
	}
	if opts, err := redis.ParseURL(connString); err != nil {
		return nil, err
	} else {
		r.db = redis.NewClient(opts)
		return r, nil
	}
}

func (l *LookupService) OutputAdded(ctx context.Context, outpoint *overlay.Outpoint, outputScript *script.Script, topic string, blockHeight uint32, blockIdx uint64) error {
	events := make([]string, 0, 5)
	var domain string
	if output, err := l.storage.FindOutput(ctx, outpoint, &l.topic, nil, true); err != nil {
		return err
	} else if output == nil {
		return errors.New("output not found")
	} else if tx, err := transaction.NewTransactionFromBEEF(output.Beef); err != nil {
		return err
	} else {
		satsOut := uint64(0)
		for _, output := range tx.Outputs[:outpoint.OutputIndex] {
			satsOut += output.Satoshis
		}
		satsIn := uint64(0)
		for _, input := range tx.Inputs {
			sourceOut := input.SourceTxOutput()
			if satsIn < satsOut {
				satsIn += sourceOut.Satoshis
				continue
			} else if satsIn == satsOut {
				outpoint := &overlay.Outpoint{
					Txid:        *input.SourceTXID,
					OutputIndex: input.SourceTxOutIndex,
				}
				if inputEvents, err := l.db.SMembers(ctx, OutpointEventsKey(outpoint)).Result(); err != nil {
					return err
				} else {
					for _, event := range inputEvents {
						if strings.HasPrefix(event, "opns:") {
							domain = strings.TrimPrefix(event, "opns:")
							events = append(events, event)
							break
						}
					}
					break
				}
			}
		}
	}
	if o := Decode(outputScript); o != nil {
		events = append(events, "mine:"+o.Domain)
	} else if insc := inscription.Decode(outputScript); insc != nil && insc.File.Type == "application/op-ns" {
		domain = string(insc.File.Content)
		events = append(events, "opns:"+domain)
		if p := p2pkh.Decode(script.NewFromBytes(insc.ScriptPrefix), true); p != nil {
			events = append(events, fmt.Sprintf("p2pkh:%s", p.AddressString))
		} else if p := p2pkh.Decode(script.NewFromBytes(insc.ScriptSuffix), true); p != nil {
			events = append(events, fmt.Sprintf("p2pkh:%s", p.AddressString))
		}
	}
	if p := p2pkh.Decode(outputScript, true); p != nil {
		events = append(events, fmt.Sprintf("p2pkh:%s", p.AddressString))
	} else if ol := ordlock.Decode(outputScript); ol != nil && domain != "" {
		events = append(events, fmt.Sprintf("list:%s", domain))
	}
	l.SaveEvents(ctx, outpoint, events, blockHeight, blockIdx)
	return nil
}

func (l *LookupService) SaveEvent(ctx context.Context, outpoint *overlay.Outpoint, event string, height uint32, idx uint64) error {
	var score float64
	if height > 0 {
		score = float64(height)*1e9 + float64(idx)
	} else {
		score = float64(time.Now().UnixNano())
	}
	_, err := l.db.Pipelined(ctx, func(p redis.Pipeliner) error {
		op := outpoint.String()
		if err := p.ZAdd(ctx, EventKey(event), redis.Z{
			Score:  score,
			Member: op,
		}).Err(); err != nil {
			return err
		} else if err := p.SAdd(ctx, OutpointEventsKey(outpoint), event).Err(); err != nil {
			return err
		}
		p.Publish(ctx, event, fmt.Sprintf("%f:%s", score, op))
		return nil
	})
	return err

}
func (l *LookupService) SaveEvents(ctx context.Context, outpoint *overlay.Outpoint, events []string, height uint32, idx uint64) error {
	var score float64
	if height > 0 {
		score = float64(height)*1e9 + float64(idx)
	} else {
		score = float64(time.Now().UnixNano())
	}
	op := outpoint.String()
	_, err := l.db.Pipelined(ctx, func(p redis.Pipeliner) error {
		for _, event := range events {
			if err := p.ZAdd(ctx, EventKey(event), redis.Z{
				Score:  score,
				Member: op,
			}).Err(); err != nil {
				return err
			} else if err := p.SAdd(ctx, OutpointEventsKey(outpoint), event).Err(); err != nil {
				return err
			}
			p.Publish(ctx, event, op)
		}
		return nil
	})
	return err
}

func (l *LookupService) Close() {
	if l.db != nil {
		l.db.Close()
	}
}

func (l *LookupService) Lookup(ctx context.Context, q *lookup.LookupQuestion) (answer *lookup.LookupAnswer, err error) {
	question := &events.Question{}
	if err := json.Unmarshal(q.Query, question); err != nil {
		return nil, err
	}

	startScore := float64(question.From.Height)*1e9 + float64(question.From.Idx)
	var outpoints []string
	if question.Events != nil && len(question.Events) > 0 {
		join := events.JoinTypeIntersect
		if question.JoinType != nil {
			join = *question.JoinType
		}
		keys := make([]string, len(question.Events))
		for _, event := range question.Events {
			keys = append(keys, EventKey(event))
		}
		results := make([]redis.Z, 0)
		switch join {
		case events.JoinTypeIntersect:
			results, err = l.db.ZInterWithScores(ctx, &redis.ZStore{
				Aggregate: "MIN",
				Keys:      keys,
			}).Result()
		case events.JoinTypeUnion:
			results, err = l.db.ZUnionWithScores(ctx, redis.ZStore{
				Aggregate: "MIN",
				Keys:      keys,
			}).Result()
		case events.JoinTypeDifference:
			results, err = l.db.ZDiffWithScores(ctx, keys...).Result()
		default:
			return nil, errors.New("invalid join type")
		}
		if err != nil {
			return nil, err
		}
		slices.SortFunc(results, func(a, b redis.Z) int {
			if question.Reverse {
				if a.Score > b.Score {
					return 1
				} else if a.Score < b.Score {
					return -1
				}
			} else {
				if a.Score < b.Score {
					return 1
				} else if a.Score > b.Score {
					return -1
				}
			}
			return 0
		})
		for _, item := range results {
			if question.Limit > 0 && len(outpoints) >= question.Limit {
				break
			} else if question.Reverse && item.Score < startScore {
				outpoints = append(outpoints, item.Member.(string))
			} else if !question.Reverse && item.Score > startScore {
				outpoints = append(outpoints, item.Member.(string))
			}
		}
	} else if question.Event != "" {
		query := redis.ZRangeArgs{
			Key:     EventKey(question.Event),
			Start:   fmt.Sprintf("(%f", startScore),
			Stop:    "+inf",
			ByScore: true,
			Rev:     question.Reverse,
			Count:   int64(question.Limit),
		}
		if outpoints, err = l.db.ZRangeArgs(ctx, query).Result(); err != nil {
			return nil, err
		}
	}
	answer = &lookup.LookupAnswer{
		Type: lookup.AnswerTypeOutputList,
	}
	for _, op := range outpoints {
		if outpoint, err := overlay.NewOutpointFromString(op); err != nil {
			return nil, err
		} else if outpoint != nil {
			if output, err := l.storage.FindOutput(ctx, outpoint, nil, nil, true); err != nil {
				return nil, err
			} else if output != nil {
				if beef, _, _, err := transaction.ParseBeef(output.Beef); err != nil {
					return nil, err
				} else {
					if output.AncillaryBeef != nil {
						if err = beef.MergeBeefBytes(output.AncillaryBeef); err != nil {
							return nil, err
						}
					}
					if beefBytes, err := beef.AtomicBytes(&outpoint.Txid); err != nil {
						return nil, err
					} else {
						answer.Outputs = append(answer.Outputs, &lookup.OutputListItem{
							OutputIndex: output.Outpoint.OutputIndex,
							Beef:        beefBytes,
						})
					}
				}
			}
		}
	}
	return answer, nil

}

func (l *LookupService) OutputSpent(ctx context.Context, outpoint *overlay.Outpoint, _ string) error {
	return l.db.SAdd(ctx, EventKey("spent"), outpoint.String()).Err()
}

func (l *LookupService) OutputsSpent(ctx context.Context, outpoints []*overlay.Outpoint, _ string) error {
	args := make([]interface{}, 0, len(outpoints))
	for _, outpoint := range outpoints {
		args = append(args, outpoint.Bytes())
	}
	return l.db.SAdd(ctx, EventKey("spent"), args...).Err()
}

func (l *LookupService) OutputDeleted(ctx context.Context, outpoint *overlay.Outpoint, topic string) error {
	op := outpoint.String()
	if events, err := l.db.SMembers(ctx, OutpointEventsKey(outpoint)).Result(); err != nil {
		return err
	} else if len(events) == 0 {
		return nil
	} else {
		_, err := l.db.Pipelined(ctx, func(p redis.Pipeliner) error {
			for _, event := range events {
				if err := p.ZRem(ctx, EventKey(event), op).Err(); err != nil {
					return err
				}
			}
			return p.Del(ctx, OutpointEventsKey(outpoint)).Err()
		})
		return err
	}
}

func (l *LookupService) OutputBlockHeightUpdated(ctx context.Context, outpoint *overlay.Outpoint, height uint32, idx uint64) error {
	var score float64
	if height > 0 {
		score = float64(height)*1e9 + float64(idx)
	} else {
		score = float64(time.Now().UnixNano())
	}
	op := outpoint.String()
	if events, err := l.db.SMembers(ctx, OutpointEventsKey(outpoint)).Result(); err != nil {
		return err
	} else if len(events) == 0 {
		return nil
	} else {
		_, err := l.db.Pipelined(ctx, func(p redis.Pipeliner) error {
			for _, event := range events {
				if err := p.ZAdd(ctx, EventKey(event), redis.Z{
					Score:  score,
					Member: op,
				}).Err(); err != nil {
					return err
				}
			}
			return nil
		})
		return err
	}
}

func (l *LookupService) GetDocumentation() string {
	return "Events lookup"
}

func (l *LookupService) GetMetaData() *overlay.MetaData {
	return &overlay.MetaData{
		Name: "Events",
	}
}

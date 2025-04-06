package main

import (
	"context"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/4chain-ag/go-overlay-services/pkg/core/engine"
	"github.com/b-open-io/bsv21-overlay/util"
	"github.com/bsv-blockchain/go-sdk/chainhash"
	"github.com/bsv-blockchain/go-sdk/overlay"
	"github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/chaintracker/headers_client"
	"github.com/bsvhackathon/GorillaPool/backend/opns"
	"github.com/bsvhackathon/GorillaPool/backend/storage"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

var chaintracker headers_client.Client
var PORT int
var SYNC bool
var rdb *redis.Client

func init() {
	godotenv.Load("../../.env")
	chaintracker = headers_client.Client{
		Url:    os.Getenv("BLOCK_HEADERS_URL"),
		ApiKey: os.Getenv("BLOCK_HEADERS_API_KEY"),
	}
	if redisOpts, err := redis.ParseURL(os.Getenv("REDIS")); err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	} else {
		rdb = redis.NewClient(redisOpts)
	}

}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS signals for graceful shutdown
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-signalChan
		log.Println("Received shutdown signal, cleaning up...")
		cancel()
	}()

	// Initialize redisStorage
	redisStorage, err := storage.NewRedisStorage(os.Getenv("REDIS"))
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer redisStorage.Close()

	lookupService, err := opns.NewLookupService(
		os.Getenv("REDIS"),
		redisStorage,
		"tm_OpNS",
	)
	if err != nil {
		log.Fatalf("Failed to initialize lookup service: %v", err)
	}
	tm := "tm_OpNS"
	e := engine.Engine{
		Managers: map[string]engine.TopicManager{
			tm: &opns.TopicManager{},
		},
		LookupServices: map[string]engine.LookupService{
			"ls_OpNS": lookupService,
		},
		Storage:      redisStorage,
		ChainTracker: chaintracker,
		PanicOnError: true,
	}
	var analyzeSpend func(ctx context.Context, outpoint string) error
	analyzeSpend = func(ctx context.Context, outpoint string) error {
		log.Println("Analyzing spend for outpoint:", outpoint)
		if spend, err := rdb.HGet(ctx, fmt.Sprintf("ot:%s:%s"+outpoint, tm), "sp").Bool(); err != nil && err != redis.Nil {
			log.Panicln("Error:", err)
		} else if spend {
			return nil
		}
		if spend, err := func(outpoint string) (string, error) {
			resp, err := http.Get(fmt.Sprintf("%s/v1/txo/spend/%s", os.Getenv("JUNGLEBUS"), outpoint))
			if err != nil {
				return "", err
			}
			defer resp.Body.Close()
			if resp.StatusCode >= 300 {
				return "", fmt.Errorf("%d-%s", resp.StatusCode, outpoint)
			} else if spendBytes, err := io.ReadAll(resp.Body); err != nil {
				return "", err
			} else {
				return hex.EncodeToString(spendBytes), nil
			}
		}(outpoint); err != nil {
			log.Panic(err)
		} else if len(spend) == 0 {
			return nil
		} else if txid, err := chainhash.NewHashFromHex(spend); err != nil {
			log.Fatalf("Invalid txid: %v", err)
		} else if tx, err := util.LoadTx(ctx, txid); err != nil {
			log.Fatalf("Failed to load transaction: %v", err)
		} else {
			logTime := time.Now()
			beef := &transaction.Beef{
				Version:      transaction.BEEF_V2,
				Transactions: map[string]*transaction.BeefTx{},
			}
			for _, input := range tx.Inputs {
				if input.SourceTransaction, err = util.LoadTx(ctx, input.SourceTXID); err != nil {
					log.Fatalf("Failed to load source transaction: %v", err)
				} else if _, err := beef.MergeTransaction(input.SourceTransaction); err != nil {
					log.Fatalf("Failed to merge source transaction: %v", err)
				}
			}
			if _, err := beef.MergeTransaction(tx); err != nil {
				log.Fatalf("Failed to merge source transaction: %v", err)
			}

			taggedBeef := overlay.TaggedBEEF{
				Topics: []string{tm},
			}
			// log.Println("Tx Loaded", tx.TxID().String(), "in", time.Since(start))
			if taggedBeef.Beef, err = beef.AtomicBytes(txid); err != nil {
				log.Fatalf("Failed to generate BEEF: %v", err)
			} else if admit, err := e.Submit(ctx, taggedBeef, engine.SubmitModeHistorical, nil); err != nil {
				log.Fatalf("Failed to submit transaction: %v", err)
			} else {
				log.Println("Processed", txid, "in", time.Since(logTime), "as", admit[tm].OutputsToAdmit)
				for _, vout := range admit[tm].OutputsToAdmit {
					outpoint := &overlay.Outpoint{
						Txid:        *txid,
						OutputIndex: vout,
					}
					if events, err := rdb.SMembers(ctx, opns.OutpointEventsKey(outpoint)).Result(); err != nil {
						log.Panicln("Error:", err)
					} else {
						for _, event := range events {
							if strings.HasPrefix(event, "opns:") {
								return analyzeSpend(ctx, outpoint.String())
							}
						}
					}
				}

			}
		}
		return nil
	}

	iter := rdb.Scan(ctx, 0, "ev:opns:*", 1000).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		log.Println("Key:", key)
		if outpoints, err := rdb.ZRangeArgs(ctx, redis.ZRangeArgs{
			Key:   key,
			Start: 0,
			Stop:  -1,
		}).Result(); err != nil {
			log.Panicln("Error:", err)
		} else {
			for _, outpoint := range outpoints {
				if err := analyzeSpend(ctx, outpoint); err != nil {
					log.Panicln("Error:", err)
				}
			}
		}
	}
}

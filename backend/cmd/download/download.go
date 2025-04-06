package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/GorillaPool/go-junglebus"
	"github.com/b-open-io/bsv21-overlay/sub"
	"github.com/b-open-io/bsv21-overlay/util"
	"github.com/bsv-blockchain/go-sdk/chainhash"
	"github.com/bsv-blockchain/go-sdk/transaction/chaintracker/headers_client"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

var JUNGLEBUS = "https://texas1.junglebus.gorillapool.io"
var jb *junglebus.Client
var chaintracker headers_client.Client

type tokenSummary struct {
	tx   int
	out  int
	time time.Duration
}

func init() {
	godotenv.Load("../../.env")
	jb, _ = junglebus.New(
		junglebus.WithHTTP(JUNGLEBUS),
	)
	chaintracker = headers_client.Client{
		Url:    os.Getenv("BLOCK_HEADERS_URL"),
		ApiKey: os.Getenv("BLOCK_HEADERS_API_KEY"),
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

	var rdb *redis.Client
	log.Println("Connecting to Redis", os.Getenv("REDIS"))
	if opts, err := redis.ParseURL(os.Getenv("REDIS")); err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	} else {
		rdb = redis.NewClient(opts)
	}

	done := make(chan *tokenSummary, 1000)
	go func() {
		ticker := time.NewTicker(time.Minute)
		txcount := 0
		outcount := 0
		// accTime
		lastTime := time.Now()
		for {
			select {
			case summary := <-done:
				txcount += summary.tx
				outcount += summary.out
				// log.Println("Got done")

			case <-ticker.C:
				log.Printf("Processed tx %d o %d in %v %vtx/s\n", txcount, outcount, time.Since(lastTime), float64(txcount)/time.Since(lastTime).Seconds())
				lastTime = time.Now()
				txcount = 0
				outcount = 0
			case <-ctx.Done():
				log.Println("Context canceled, stopping processing...")
				return
			}
		}
	}()

	txids, err := rdb.ZRangeArgs(ctx, redis.ZRangeArgs{
		Key:     "opns",
		Stop:    "+inf",
		Start:   "-inf",
		ByScore: true,
	}).Result()
	if err != nil {
		log.Fatalf("Failed to query Redis: %v", err)
	}

	var alreadyLoaded sync.Map
	limiter := make(chan struct{}, 10)
	var wg sync.WaitGroup
	for _, txidStr := range txids {
		if _, loaded := alreadyLoaded.LoadOrStore(txidStr, struct{}{}); loaded {
			continue
		}
		wg.Add(1)
		limiter <- struct{}{}
		go func(txidStr string) {
			defer wg.Done()
			defer func() { <-limiter }()
			start := time.Now()
			if txid, err := chainhash.NewHashFromHex(txidStr); err != nil {
				panic(err)
			} else if tx, err := util.LoadTx(ctx, txid); err != nil {
				panic(err)
			} else {
				for _, input := range tx.Inputs {
					txidStr := input.SourceTXID.String()
					if _, loaded := alreadyLoaded.LoadOrStore(txidStr, struct{}{}); loaded {
						continue
					}
					if _, err = util.LoadTx(ctx, input.SourceTXID); err != nil {
						panic(err)
					}
				}
				log.Println("Loaded tx", txidStr, "in", time.Since(start))
			}
		}(txidStr)
	}
	wg.Wait()
	sub.QueueDb.Close()
}

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/4chain-ag/go-overlay-services/pkg/core/engine"
	"github.com/4chain-ag/go-overlay-services/pkg/core/gasp/core"

	// storageRedis "github.com/b-open-io/bsv21-overlay/storage/redis"
	"github.com/b-open-io/bsv21-overlay/topics"
	"github.com/bsv-blockchain/go-sdk/chainhash"
	"github.com/bsv-blockchain/go-sdk/overlay"
	"github.com/bsv-blockchain/go-sdk/overlay/lookup"
	"github.com/bsv-blockchain/go-sdk/overlay/topic"
	"github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/broadcaster"
	"github.com/bsv-blockchain/go-sdk/transaction/chaintracker/headers_client"
	"github.com/bsvhackathon/GorillaPool/backend/opns"
	"github.com/bsvhackathon/GorillaPool/backend/storage"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

var chaintracker headers_client.Client
var PORT int
var SYNC bool
var rdb, sub *redis.Client
var peers = []string{}

type subRequest struct {
	topics []string
	writer *bufio.Writer
}

var subscribe = make(chan *subRequest, 100)   // Buffered channel
var unsubscribe = make(chan *subRequest, 100) // Buffered channel
func init() {
	godotenv.Load("../../.env")
	chaintracker = headers_client.Client{
		Url:    os.Getenv("BLOCK_HEADERS_URL"),
		ApiKey: os.Getenv("BLOCK_HEADERS_API_KEY"),
	}
	PORT, _ = strconv.Atoi(os.Getenv("PORT"))
	flag.IntVar(&PORT, "p", PORT, "Port to listen on")
	flag.BoolVar(&SYNC, "s", false, "Start sync")
	flag.Parse()
	if PORT == 0 {
		PORT = 3000
	}
	if redisOpts, err := redis.ParseURL(os.Getenv("REDIS")); err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	} else {
		rdb = redis.NewClient(redisOpts)
		sub = redis.NewClient(redisOpts)
	}
	PEERS := os.Getenv("PEERS")
	if PEERS != "" {
		peers = strings.Split(PEERS, ",")
	}
}

func main() {
	// Create a context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Channel to listen for OS signals
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	hostingUrl := os.Getenv("HOSTING_URL")

	storage, err := storage.NewRedisStorage(os.Getenv("REDIS"))
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer storage.Close()

	lookupService, err := opns.NewLookupService(
		os.Getenv("REDIS"),
		storage,
	)
	if err != nil {
		log.Fatalf("Failed to initialize event lookup: %v", err)
	}

	e := engine.Engine{
		Managers: map[string]engine.TopicManager{},
		LookupServices: map[string]engine.LookupService{
			"ls_opns": lookupService,
		},
		SyncConfiguration: map[string]engine.SyncConfiguration{},
		Broadcaster: &broadcaster.Arc{
			ApiUrl:  "https://arc.taal.com",
			WaitFor: broadcaster.ACCEPTED_BY_NETWORK,
		},
		HostingURL:   hostingUrl,
		Storage:      storage,
		ChainTracker: chaintracker,
		PanicOnError: true,
	}
	if tms, err := rdb.SMembers(ctx, "topics").Result(); err != nil {
		log.Fatalf("Failed to get topics from Redis: %v", err)
	} else {
		for _, top := range tms {
			log.Println("Adding topic manager:", top)
			tokenId := top[3:]
			e.Managers[top] = topics.NewBsv21ValidatedTopicManager(
				top,
				storage,
				[]string{tokenId},
			)
			e.SyncConfiguration[top] = engine.SyncConfiguration{
				Type:  engine.SyncConfigurationPeers,
				Peers: peers,
			}
		}
	}

	// Create a new Fiber app
	app := fiber.New()
	app.Use(logger.New())

	// Define routes
	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Hello, World!")
	})

	app.Post("/submit", func(c *fiber.Ctx) error {
		topicsHeader := c.Get("x-topics", "")
		if topicsHeader == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing x-topics header",
			})
		}
		taggedBeef := overlay.TaggedBEEF{}
		if err := json.Unmarshal([]byte(topicsHeader), &taggedBeef.Topics); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid x-topics header",
			})
		}
		copy(taggedBeef.Beef, c.Body())
		onSteakReady := func(steak *overlay.Steak) {
			for top, admit := range *steak {
				if sync, ok := e.SyncConfiguration[top]; !ok {
					continue
				} else if sync.Type == engine.SyncConfigurationPeers && len(admit.CoinsToRetain) > 0 || len(admit.OutputsToAdmit) > 0 {
					for _, peer := range sync.Peers {
						if _, err := (&topic.HTTPSOverlayBroadcastFacilitator{Client: http.DefaultClient}).Send(peer, &overlay.TaggedBEEF{
							Beef:   taggedBeef.Beef,
							Topics: []string{top},
						}); err != nil {
							log.Printf("Error submitting taggedBEEF to peer %s: %v", peer, err)
						}
					}
				}
			}
		}
		if steak, err := e.Submit(c.Context(), taggedBeef, engine.SubmitModeCurrent, onSteakReady); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		} else {
			return c.JSON(steak)
		}

	})

	app.Post("/requestSyncResponse", func(c *fiber.Ctx) error {
		var request core.GASPInitialRequest
		topic := c.Get("x-bsv-topic", "bsv21")
		if err := c.BodyParser(&request); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request",
			})
		} else if response, err := e.ProvideForeignSyncResponse(c.Context(), &request, topic); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		} else {
			return c.JSON(response)
		}
	})

	app.Post("/requestForeignGASPNode", func(c *fiber.Ctx) error {
		var request core.GASPNodeRequest
		if err := c.BodyParser(&request); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request",
			})
		} else if response, err := e.ProvideForeignGASPNode(
			c.Context(),
			request.GraphID,
			&overlay.Outpoint{Txid: *request.Txid, OutputIndex: request.OutputIndex},
		); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		} else {
			return c.JSON(response)
		}
	})

	app.Post("/lookup", func(c *fiber.Ctx) error {
		var question lookup.LookupQuestion
		if err := c.BodyParser(&question); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request",
			})
		} else if answer, err := e.Lookup(c.Context(), &question); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		} else {
			return c.JSON(answer)
		}
	})

	app.Get("/mine/:name", func(c *fiber.Ctx) error {
		name := c.Params("name")
		if name == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing name",
			})
		}
		question := &opns.Question{
			Event: "mine:" + name,
		}
		if b, err := json.Marshal(question); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid question",
			})
		} else if answer, err := e.Lookup(c.Context(), &lookup.LookupQuestion{
			Service: "ls_OpNS",
			Query:   json.RawMessage(b),
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		} else if len(answer.Outputs) == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "No answer found",
			})
		} else if tx, err := transaction.NewTransactionFromBEEF(answer.Outputs[0].Beef); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid transaction",
			})
		} else {
			return c.JSON(fiber.Map{
				"outpoint": (&overlay.Outpoint{
					Txid:        *tx.TxID(),
					OutputIndex: answer.Outputs[0].OutputIndex,
				}).String(),
			})
		}
	})

	// Stripe checkout session endpoint
	app.Post("/create-checkout-session", func(c *fiber.Ctx) error {
		// Parse the request body
		type CheckoutRequest struct {
			ProductId   string `json:"productId"`
			Name        string `json:"name"`
			Price       int    `json:"price"` // in cents
			Success_url string `json:"success_url"`
			Cancel_url  string `json:"cancel_url"`
		}

		var req CheckoutRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request body",
			})
		}

		// Validate required fields
		if req.ProductId == "" || req.Name == "" || req.Price <= 0 || req.Success_url == "" || req.Cancel_url == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing required fields",
			})
		}

		// Create the checkout session using Stripe API
		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Stripe key not configured",
			})
		}

		// Set up the HTTP client
		client := &http.Client{}

		// Create the request data for Stripe API
		data := map[string]any{
			"payment_method_types": []string{"card"},
			"line_items": []map[string]any{
				{
					"price_data": map[string]any{
						"currency": "usd",
						"product_data": map[string]any{
							"name":        fmt.Sprintf("%s@1sat.name", req.Name),
							"description": "1sat Name Registration",
						},
						"unit_amount": req.Price, // already in cents
					},
					"quantity": 1,
				},
			},
			"metadata": map[string]string{
				"name":       req.Name,
				"product_id": req.ProductId,
			},
			"mode":        "payment",
			"success_url": req.Success_url,
			"cancel_url":  req.Cancel_url,
		}

		// Convert the data to JSON
		jsonData, err := json.Marshal(data)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create checkout data",
			})
		}

		// Create the request
		req1, err := http.NewRequest("POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(string(jsonData)))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create request",
			})
		}

		// Set headers
		req1.Header.Set("Content-Type", "application/json")
		req1.Header.Set("Authorization", "Bearer "+stripeKey)

		// Send the request
		resp, err := client.Do(req1)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to contact Stripe API",
			})
		}
		defer resp.Body.Close()

		// Parse the response
		var result map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to parse Stripe response",
			})
		}

		// Check if there was an error
		if resp.StatusCode != http.StatusOK {
			errorMsg := "Unknown error"
			if errObj, ok := result["error"].(map[string]any); ok {
				if msg, ok := errObj["message"].(string); ok {
					errorMsg = msg
				}
			}
			return c.Status(resp.StatusCode).JSON(fiber.Map{
				"error": fmt.Sprintf("Stripe error: %s", errorMsg),
			})
		}

		// Return the checkout session URL
		return c.JSON(fiber.Map{
			"url": result["url"],
		})
	})

	// Name registration endpoint
	app.Post("/register", func(c *fiber.Ctx) error {
		// Parse the request body
		type RegisterRequest struct {
			Handle  string `json:"handle"`
			Address string `json:"address"` // BSV address
		}

		var req RegisterRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request body",
			})
		}

		// Validate required fields
		if req.Handle == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing handle",
			})
		}

		// Check if the name is already registered (taken)
		question := &opns.Question{
			Event: "mine:" + req.Handle,
		}

		b, err := json.Marshal(question)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid question",
			})
		}

		answer, err := e.Lookup(c.Context(), &lookup.LookupQuestion{
			Service: "ls_OpNS",
			Query:   json.RawMessage(b),
		})

		// If we got an answer with outputs, the name is already taken
		if err == nil && len(answer.Outputs) > 0 {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "Name is already registered",
			})
		}

		// For debugging only - in production this would actually mint the name
		log.Printf("Registering name: %s for address: %s", req.Handle, req.Address)

		// TODO: Call actual mining logic here

		// For now, we'll simulate success

		// Create a mock transaction ID for testing
		mockTxid := fmt.Sprintf("%064x", req.Handle)

		// Return success response
		return c.JSON(fiber.Map{
			"success":       true,
			"transactionId": mockTxid,
			"name":          req.Handle + "@1sat.name",
			"message":       "Name registration initiated",
		})
	})

	app.Post("/arc-ingest", func(c *fiber.Ctx) error {
		var status broadcaster.ArcResponse
		if err := c.BodyParser(&status); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request",
			})
		} else if txid, err := chainhash.NewHashFromHex(status.Txid); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid txid",
			})
		} else if merklePath, err := transaction.NewMerklePathFromHex(status.MerklePath); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid merkle path",
			})
		} else if err := e.HandleNewMerkleProof(c.Context(), txid, merklePath); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		} else {
			return c.JSON(fiber.Map{
				"status": "success",
			})
		}
	})

	app.Get("/subscribe/:topics", func(c *fiber.Ctx) error {
		topicsParam := c.Params("topics")
		if topicsParam == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing topics",
			})
		}
		topics := strings.Split(topicsParam, ",")
		if len(topics) == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "No topics provided",
			})
		}

		// Set headers for SSE
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")

		// Add the client to the topicClients map
		writer := bufio.NewWriter(c.Context().Response.BodyWriter())
		subReq := &subRequest{
			topics: topics,
			writer: writer,
		}
		subscribe <- subReq

		// Wait for the client to disconnect
		<-c.Context().Done()
		unsubscribe <- subReq

		log.Println("Client disconnected:", topics)
		return nil
	})

	// Start the Redis PubSub goroutine
	go func() {
		pubSub := sub.PSubscribe(ctx, "*")
		pubSubChan := pubSub.Channel() // Subscribe to all topics
		defer pubSub.Close()

		topicClients := make(map[string][]*bufio.Writer) // Map of topic to connected clients

		for {
			select {
			case <-ctx.Done():
				log.Println("Broadcasting stopped")
				return

			case msg := <-pubSubChan:
				// Broadcast the message to all clients subscribed to the topic
				if clients, exists := topicClients[msg.Channel]; exists {
					for _, client := range clients {
						parts := strings.Split(msg.Payload, ":")
						if len(parts) != 2 {
							log.Println("Invalid message format:", msg.Payload)
							continue
						}
						_, _ = fmt.Fprintf(client, "event: %s\n", msg.Channel)
						_, _ = fmt.Fprintf(client, "data: %s\n", parts[1])
						_, _ = fmt.Fprintf(client, "id: %s\n\n", parts[0])
						_ = client.Flush()
					}
				}

			case subReq := <-subscribe:
				// Add the client to the topicClients map
				for _, topic := range subReq.topics {
					topicClients[topic] = append(topicClients[topic], subReq.writer)
				}

			case subReq := <-unsubscribe:
				// Remove the client from the topicClients map
				for _, topic := range subReq.topics {
					clients := topicClients[topic]
					for i, client := range clients {
						if client == subReq.writer {
							topicClients[topic] = append(clients[:i], clients[i+1:]...)
							break
						}
					}
				}
			}
		}
	}()

	// Goroutine to handle OS signals
	go func() {
		<-signalChan
		log.Println("Shutting down server...")

		// Cancel the context to stop goroutines
		cancel()

		// Gracefully shut down the Fiber app
		if err := app.Shutdown(); err != nil {
			log.Fatalf("Error shutting down server: %v", err)
		}

		// Close Redis connections
		if err := rdb.Close(); err != nil {
			log.Printf("Error closing Redis client: %v", err)
		}
		if err := sub.Close(); err != nil {
			log.Printf("Error closing Redis subscription client: %v", err)
		}

		log.Println("Server stopped.")
		os.Exit(0)
	}()

	if SYNC {
		if err := e.StartGASPSync(context.Background()); err != nil {
			log.Fatalf("Error starting sync: %v", err)
		}
	}

	// Start the server on the specified port
	if err := app.Listen(fmt.Sprintf(":%d", PORT)); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/4chain-ag/go-overlay-services/pkg/core/engine"
	"github.com/4chain-ag/go-overlay-services/pkg/core/gasp/core"
	"github.com/b-open-io/bsv21-overlay/topics"
	"github.com/bitcoin-sv/go-paymail/logging"
	"github.com/bitcoin-sv/go-paymail/server"
	"github.com/bsv-blockchain/go-sdk/chainhash"
	"github.com/bsv-blockchain/go-sdk/overlay"
	"github.com/bsv-blockchain/go-sdk/overlay/lookup"
	"github.com/bsv-blockchain/go-sdk/overlay/topic"
	"github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/broadcaster"
	"github.com/bsv-blockchain/go-sdk/transaction/chaintracker/headers_client"
	"github.com/bsvhackathon/GorillaPool/backend/opns"
	opnspaymail "github.com/bsvhackathon/GorillaPool/backend/paymail"
	"github.com/bsvhackathon/GorillaPool/backend/storage"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
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
		"tm_OpNS",
	)
	if err != nil {
		log.Fatalf("Failed to initialize event lookup: %v", err)
	}

	e := engine.Engine{
		Managers: map[string]engine.TopicManager{},
		LookupServices: map[string]engine.LookupService{
			"ls_OpNS": lookupService,
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
	app.Use(compress.New())
	app.Use(cors.New(cors.Config{AllowOrigins: "*"}))
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
		// Get form values directly - no need to parse body first in Fiber
		productId := c.FormValue("productId", "")
		name := c.FormValue("name", "")
		priceStr := c.FormValue("price", "")
		successUrl := c.FormValue("success_url", "")
		cancelUrl := c.FormValue("cancel_url", "")
		address := c.FormValue("address", "")

		// Validate required fields
		if productId == "" || name == "" || priceStr == "" || successUrl == "" || cancelUrl == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing required fields",
			})
		}

		// Parse price
		price, err := strconv.Atoi(priceStr)
		if err != nil || price <= 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid price",
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

		// Create form data for the Stripe API request
		formData := url.Values{}
		formData.Add("payment_method_types[]", "card")
		formData.Add("line_items[0][price_data][currency]", "usd")
		formData.Add("line_items[0][price_data][product_data][name]", fmt.Sprintf("%s@1sat.name", name))
		formData.Add("line_items[0][price_data][product_data][description]", "1sat Name Registration")
		formData.Add("line_items[0][price_data][unit_amount]", strconv.Itoa(price))
		formData.Add("line_items[0][quantity]", "1")
		formData.Add("metadata[name]", name)
		formData.Add("metadata[product_id]", productId)
		// Store the customer's address in metadata if provided
		if address != "" {
			formData.Add("metadata[address]", address)
		}
		formData.Add("mode", "payment")
		formData.Add("success_url", successUrl)
		formData.Add("cancel_url", cancelUrl)

		// Create the request
		req, err := http.NewRequest("POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(formData.Encode()))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create request",
			})
		}

		// Set headers
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Authorization", "Bearer "+stripeKey)

		// Send the request
		resp, err := client.Do(req)
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
		// Get form values directly
		handle := c.FormValue("handle", "")
		address := c.FormValue("address", "")

		// Validate required fields
		if handle == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing handle",
			})
		}

		// Check if the name is already registered (taken)
		question := &opns.Question{
			Event: "mine:" + handle,
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

		// Check if payment was made for this name
		paid := isNamePaid(c.Context(), handle)

		// If the name hasn't been paid for, require payment first
		if !paid {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error":   "Payment required for this name",
				"message": "Please complete payment before registering",
			})
		}

		// If address is not provided, try to get it from Redis
		if address == "" {
			storedAddress, err := getNameAddress(c.Context(), handle)
			if err == nil && storedAddress != "" {
				address = storedAddress
				log.Printf("Using stored address for %s: %s", handle, address)
			} else {
				log.Printf("No stored address found for %s, using default", handle)
				address = "1sat4utxoLYSZb3zvWH8vZ9ULhGbPZEPi6" // Default address
			}
		}

		// Log registration attempt
		log.Printf("Registering name: %s for address: %s", handle, address)

		// Call the actual mining API
		client := &http.Client{}
		miningPayload := map[string]string{
			"domain":       handle,
			"ownerAddress": address,
		}

		miningData, err := json.Marshal(miningPayload)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to prepare mining request",
			})
		}

		req, err := http.NewRequest("POST", "https://go-opns-mint-production.up.railway.app/mine", bytes.NewBuffer(miningData))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create mining request",
			})
		}

		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to call mining API: " + err.Error(),
			})
		}
		defer resp.Body.Close()

		// Handle mining API response
		if resp.StatusCode != http.StatusOK {
			log.Printf("Mining API returned error status: %s", resp.Status)
			return c.Status(resp.StatusCode).JSON(fiber.Map{
				"error": "Mining API returned error status: " + resp.Status,
			})
		}

		// The mining API returns a simple string which is the txid
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("Error reading mining API response: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to read mining API response",
			})
		}

		// The response is just the txid as a string (remove any quotes or whitespace)
		txid := strings.Trim(string(bodyBytes), "\" \t\n\r")

		// Mark the name as successfully mined
		if err := markNameAsMined(c.Context(), handle, txid); err != nil {
			log.Printf("Error marking name as mined in Redis: %v", err)
			// Continue anyway - we still have the txid
		}

		log.Printf("Successfully registered name %s with txid %s", handle, txid)

		// Return success response
		return c.JSON(fiber.Map{
			"success":       true,
			"transactionId": txid,
			"name":          handle + "@1sat.name",
			"message":       "Name registration initiated",
		})
	})

	// Stripe webhook endpoint for handling payment events
	app.Post("/stripe-webhook", func(c *fiber.Ctx) error {
		// Get the stripe webhook secret from env
		webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
		if webhookSecret == "" {
			log.Println("Warning: STRIPE_WEBHOOK_SECRET not set")
		}

		// Verify the webhook signature
		payload := c.Body()
		// Signature is not currently validated but could be used with Stripe's SDK
		_ = c.Get("Stripe-Signature") // We acknowledge the signature but don't use it yet

		// For debugging
		log.Printf("Received webhook: %s", string(payload))

		// Parse the event
		var event map[string]interface{}
		if err := json.Unmarshal(payload, &event); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid JSON payload",
			})
		}

		// Get the event type
		eventType, ok := event["type"].(string)
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing event type",
			})
		}

		// Only process checkout.session.completed events
		if eventType != "checkout.session.completed" {
			log.Printf("Ignoring event of type: %s", eventType)
			return c.JSON(fiber.Map{
				"received": true,
			})
		}

		// Extract session data
		sessionData, ok := event["data"].(map[string]interface{})
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid event data",
			})
		}

		session, ok := sessionData["object"].(map[string]interface{})
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid session data",
			})
		}

		// Check payment status
		paymentStatus, ok := session["payment_status"].(string)
		if !ok || paymentStatus != "paid" {
			log.Printf("Payment not complete. Status: %s", paymentStatus)
			return c.JSON(fiber.Map{
				"received": true,
				"status":   "payment_incomplete",
			})
		}

		// Get metadata
		metadata, ok := session["metadata"].(map[string]interface{})
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing metadata",
			})
		}

		// Extract the name and customer details
		name, ok := metadata["name"].(string)
		if !ok || name == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Missing name in metadata",
			})
		}

		// Get the address from metadata if available
		address, ok := metadata["address"].(string)
		if !ok || address == "" {
			// Fallback to default address if not provided
			address = "1sat4utxoLYSZb3zvWH8vZ9ULhGbPZEPi6"
			log.Printf("Using default address for %s: %s", name, address)
		}

		// Get customer details from the session
		customerDetails, ok := session["customer_details"].(map[string]interface{})
		if !ok {
			log.Println("Missing customer details")
		}

		// Get customer email or use a default
		var customerEmail string
		if email, ok := customerDetails["email"].(string); ok {
			customerEmail = email
		} else {
			customerEmail = "unknown@example.com"
		}

		log.Printf("Processing successful payment for name: %s, customer: %s", name, customerEmail)

		// Mark the name as paid in Redis
		if err := markNameAsPaid(c.Context(), name, address); err != nil {
			log.Printf("Error marking name as paid in Redis: %v", err)
			// Continue anyway - we still want to try registering the name
		}

		// Call the actual mining API
		client := &http.Client{}
		miningPayload := map[string]string{
			"domain":       name,
			"ownerAddress": address,
		}

		miningData, err := json.Marshal(miningPayload)
		if err != nil {
			log.Printf("Error preparing mining request: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to prepare mining request",
			})
		}

		req, err := http.NewRequest("POST", "https://go-opns-mint-production.up.railway.app/mine", bytes.NewBuffer(miningData))
		if err != nil {
			log.Printf("Error creating mining request: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create mining request",
			})
		}

		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error calling mining API: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to call mining API: " + err.Error(),
			})
		}
		defer resp.Body.Close()

		// Handle mining API response
		if resp.StatusCode != http.StatusOK {
			log.Printf("Mining API returned error status: %s", resp.Status)
			return c.Status(resp.StatusCode).JSON(fiber.Map{
				"error": "Mining API returned error status: " + resp.Status,
			})
		}

		// The mining API returns a simple string which is the txid
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("Error reading mining API response: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to read mining API response",
			})
		}

		// The response is just the txid as a string (remove any quotes or whitespace)
		txid := strings.Trim(string(bodyBytes), "\" \t\n\r")

		// Mark the name as successfully mined
		if err := markNameAsMined(c.Context(), name, txid); err != nil {
			log.Printf("Error marking name as mined in Redis: %v", err)
			// Continue anyway - we still have the txid
		}

		log.Printf("Successfully registered name %s with txid %s", name, txid)

		// Return success
		return c.JSON(fiber.Map{
			"received":      true,
			"success":       true,
			"name":          name + "@1sat.name",
			"transactionId": txid,
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

	// hack in paymail for now
	go func() {
		logger := logging.GetDefaultLogger()

		sl := server.PaymailServiceLocator{}
		sl.RegisterPaymailService(new(opnspaymail.OpnsServiceProvider))
		sl.RegisterPikeContactService(new(opnspaymail.OpnsServiceProvider))
		sl.RegisterPikePaymentService(new(opnspaymail.OpnsServiceProvider))

		var err error
		port := 3001
		// portEnv := os.Getenv("PORT")
		// if portEnv != "" {
		// 	if port, err = strconv.Atoi(portEnv); err != nil {
		// 		logger.Fatal().Msg(err.Error())
		// 	}
		// }
		// Custom server with lots of customizable goodies
		config, err := server.NewConfig(
			&sl,
			server.WithBasicRoutes(),
			server.WithP2PCapabilities(),
			server.WithBeefCapabilities(),
			// server.WithDomain("1sat.app"),
			server.WithDomain(os.Getenv("PAYMAIL_DOMAIN")),
			// server.WithDomain("localhost:3000"),
			// server.WithGenericCapabilities(),
			server.WithPort(port),
			// server.WithServiceName("BsvAliasCustom"),
			server.WithTimeout(15*time.Second),
			// server.WithCapabilities(customCapabilities()),
		)
		if err != nil {
			logger.Fatal().Msg(err.Error())
		}
		config.Prefix = "https://" //normally paymail requires https, but for demo purposes we'll use http

		// Create & start the server
		server.StartServer(server.CreateServer(config), config.Logger)
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

// Helper function to check if a name has been paid for
func isNamePaid(ctx context.Context, name string) bool {
	result, err := rdb.HGet(ctx, "paid_names", name).Bool()
	if err != nil {
		return false
	}
	return result
}

// Helper function to mark a name as paid
func markNameAsPaid(ctx context.Context, name string, address string) error {
	// Store name payment status
	if err := rdb.HSet(ctx, "paid_names", name, true).Err(); err != nil {
		return err
	}

	// Store customer address for this name
	if err := rdb.HSet(ctx, "name_addresses", name, address).Err(); err != nil {
		return err
	}

	return nil
}

// Helper function to mark a name as successfully mined
func markNameAsMined(ctx context.Context, name string, txid string) error {
	// Store the transaction ID
	if err := rdb.HSet(ctx, "name_txids", name, txid).Err(); err != nil {
		return err
	}

	return nil
}

// Helper function to get the address for a name
func getNameAddress(ctx context.Context, name string) (string, error) {
	address, err := rdb.HGet(ctx, "name_addresses", name).Result()
	return address, err
}

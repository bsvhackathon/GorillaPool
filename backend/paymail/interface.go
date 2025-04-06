package opnspaymail

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"

	"github.com/bitcoin-sv/go-paymail"
	"github.com/bitcoin-sv/go-paymail/server"
	"github.com/bitcoin-sv/go-paymail/spv"

	"github.com/libsv/go-bt/v2/bscript"
)

// Example demo implementation of a service provider
type OpnsServiceProvider struct {
	// Extend your dependencies or custom values
}

type Opns struct {
	Outpoint string                 `json:"outpoint"`
	Origin   string                 `json:"origin"`
	Owner    string                 `json:"owner"`
	Domain   string                 `json:"domain"`
	Map      map[string]interface{} `json:"map,omitempty"`
}

// GetPaymailByAlias is a demo implementation of this interface
func (d *OpnsServiceProvider) GetAddressStringByAlias(_ context.Context, alias, domain string) (string, error) {

	address := ""

	if resp, err := http.Post(
		os.Getenv("HOSTING_URL")+"/lookup",
		"application/json",
		bytes.NewReader([]byte(`{"event":"paymail","alias":"`+alias+`","domain":"`+domain+`"}`)),
	); err != nil {
		return address, err
	} else {
		var opns *Opns
		defer resp.Body.Close()
		if err := json.NewDecoder(resp.Body).Decode(&opns); err != nil {
			return address, err
		}

		address = opns.Owner
	}
	return address, nil
}

// GetPaymailByAlias is a demo implementation of this interface
func (d *OpnsServiceProvider) GetPaymailByAlias(ctx context.Context, alias, domain string,
	_ *server.RequestMetadata,
) (*paymail.AddressInformation, error) {
	if add, err := d.GetAddressStringByAlias(ctx, alias, domain); err != nil {
		return nil, err
	} else {
		return &paymail.AddressInformation{
			Alias:       alias,
			Domain:      domain,
			LastAddress: add,
			PubKey:      "000000000000000000000000000000000000000000000000000000000000000000",
		}, nil
	}
}

// CreateAddressResolutionResponse is a demo implementation of this interface
func (d *OpnsServiceProvider) CreateAddressResolutionResponse(ctx context.Context, alias, domain string,
	senderValidation bool, _ *server.RequestMetadata,
) (*paymail.ResolutionPayload, error) {
	// Generate a new destination / output for the basic address resolution
	if add, err := d.GetAddressStringByAlias(ctx, alias, domain); err != nil {
		return nil, err
	} else if p2pkh, err := bscript.NewP2PKHFromAddress(add); err != nil {
		return nil, err
	} else {
		response := &paymail.ResolutionPayload{
			Output: hex.EncodeToString(*p2pkh),
		}
		// if senderValidation {
		// 	if response.Signature, err = bitcoin.SignMessage(
		// 		p.PrivateKey, response.Output, false,
		// 	); err != nil {
		// 		return nil, errors.New("invalid signature: " + err.Error())
		// 	}
		// }
		return response, nil
	}
}

// CreateP2PDestinationResponse is a demo implementation of this interface
func (d *OpnsServiceProvider) CreateP2PDestinationResponse(ctx context.Context, alias, domain string,
	satoshis uint64, _ *server.RequestMetadata,
) (*paymail.PaymentDestinationPayload, error) {
	// Generate a new destination for the p2p request
	output := &paymail.PaymentOutput{
		Satoshis: satoshis,
	}
	if add, err := d.GetAddressStringByAlias(ctx, alias, domain); err != nil {
		return nil, err
	} else if p2pkh, err := bscript.NewP2PKHFromAddress(add); err != nil {
		return nil, err
	} else {
		output.Script = hex.EncodeToString(*p2pkh)
		// output.Address = add
		// Create the response
		return &paymail.PaymentDestinationPayload{
			Outputs:   []*paymail.PaymentOutput{output},
			Reference: "1234567890", // todo: this should be unique per request
		}, nil
	}
}

// RecordTransaction is a demo implementation of this interface
func (d *OpnsServiceProvider) RecordTransaction(ctx context.Context,
	p2pTx *paymail.P2PTransaction, _ *server.RequestMetadata,
) (*paymail.P2PTransactionPayload, error) {
	// Record the tx into your datastore layer
	return nil, nil
}

// VerifyMerkleRoots is a demo implementation of this interface
func (d *OpnsServiceProvider) VerifyMerkleRoots(ctx context.Context, merkleProofs []*spv.MerkleRootConfirmationRequestItem) error {
	// Verify the Merkle roots
	return nil
}

func (d *OpnsServiceProvider) AddContact(
	ctx context.Context,
	requesterPaymail string,
	contact *paymail.PikeContactRequestPayload,
) error {
	return nil
}

func (d *OpnsServiceProvider) CreatePikeOutputResponse(
	ctx context.Context,
	alias, domain, senderPubKey string,
	satoshis uint64,
	metaData *server.RequestMetadata,
) (*paymail.PikePaymentOutputsResponse, error) {
	return nil, nil
}

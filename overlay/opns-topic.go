package overlay

import (
	"context"
	"errors"

	"github.com/bsv-blockchain/go-sdk/overlay"
	"github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsvhackathon/GorillaPool/overlay/opns"
)

type OpNSTopicManager struct{}

func (tm *OpNSTopicManager) IdentifyAdmissableOutputs(ctx context.Context, beefBytes []byte, previousCoins []uint32) (admit overlay.AdmittanceInstructions, err error) {
	_, tx, _, err := transaction.ParseBeef(beefBytes)
	if err != nil {
		return admit, err
	} else if tx == nil {
		return admit, errors.New("transaction is nil")
	}

	
	if len(previousCoins) == 0 {
		return admit, errors.New("no previous coins provided")
	}
	admit.CoinsToRetain = previousCoins
	for vout, output := range tx.Outputs {
		if o, _ := opns.Decode(output.LockingScript); o != nil {
			// admit.OutputsToAdmit = append(admit.OutputsToAdmit, uint32(vout))
		} else if insc := 
	}

	return
}

func (tm *OpNSTopicManager) IdentifyNeededInputs(ctx context.Context, beefBytes []byte) ([]*overlay.Outpoint, error) {
	return []*overlay.Outpoint{}, nil
}

func (tm *OpNSTopicManager) GetDocumentation() string {
	return "OpNS Topic Manager"
}

func (tm *OpNSTopicManager) GetMetaData() *overlay.MetaData {
	return &overlay.MetaData{
		Name: "OpNS",
	}
}

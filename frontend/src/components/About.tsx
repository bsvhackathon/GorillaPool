

const About = () => {
  return (
    <div className="card bg-base-200 shadow-md mt-8 max-w-2xl mx-auto">
      <div className="card-body">
        <h3 className="text-xl font-bold mb-2">What is this?</h3>

        <p className="mb-3">
          1Sat Names are paymail addresses that resolve to special tokens you can hold in your wallet.
        </p>

        <p className="mb-3">
          Paymail addresses look just like email addresses, and make it easy to send crypto payments to any wallet that supports them.
        </p>



        <div className="flex flex-col md:flex-row gap-4 mt-2">
          <div className="flex-1 bg-base-100 rounded-lg p-4 shadow-sm">
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <title>Domain icon</title>
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" />
              </svg>
              <span className="font-semibold">Multi-Domain Support</span>
            </div>
            <p className="text-sm">
              Works across many domain names. Any domain configured to resolve 1sat names can provide access to your identity.
            </p>
          </div>

          <div className="flex-1 bg-base-100 rounded-lg p-4 shadow-sm">
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <title>Mining icon</title>
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">Proof of Work Mining</span>
            </div>
            <p className="text-sm">
              These tokens are mined with proof of work for fair distribution, preventing name squatting.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mt-4">
          <div className="flex-1 bg-base-100 rounded-lg p-4 shadow-sm">
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <title>Trade icon</title>
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">Tradeable on DEX</span>
            </div>
            <p className="text-sm">
              Can be listed for sale and purchased on the blockchain directly through existing decentralized protocols.
            </p>
          </div>

          <div className="flex-1 bg-base-100 rounded-lg p-4 shadow-sm">
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <title>Document icon</title>
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">OPNS Contract</span>
            </div>
            <p className="text-sm">
              1Sat names are standard 1Sat Ordinals issued by a custom "OPNS" contract, ensuring unique issuance of names.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
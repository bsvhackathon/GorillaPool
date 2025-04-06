import { type FC } from 'react';
import { Link } from 'react-router-dom';

const DomainSetupPage: FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold merriweather-bold mb-6">Add 1sat Name Support to Your Domain</h1>
      
      <p className="mb-6">
        You can add support for 1sat names on your own domain by following one of these two methods.
        Choose the option that best fits your technical capabilities and requirements.
      </p>
      
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-xl">Option 1: DNS Redirect</h2>
            <p className="text-sm opacity-70 mb-4">Simpler method, requires DNS configuration</p>
            
            <p className="mb-4">
              This method uses DNS CNAME records to redirect username requests to the 1sat service.
            </p>
            
            <h3 className="font-bold mt-4">Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 mb-4">
              <li>
                Access your domain's DNS settings through your domain registrar (e.g., Namecheap, GoDaddy).
              </li>
              <li>
                Add a wildcard CNAME record:
                <div className="bg-base-300 p-2 rounded mt-1 font-mono text-sm">
                  *._1sat → redirect.1sat.name
                </div>
              </li>
              <li>
                Wait for DNS propagation (can take up to 24-48 hours).
              </li>
              <li>
                Test by visiting username.yourdomain.com.
              </li>
            </ol>
            
            <div className="card-actions justify-end mt-4">
              <a 
                href="https://docs.1sat.name/dns-setup"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Detailed DNS Guide
              </a>
            </div>
          </div>
        </div>
        
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-xl">Option 2: Run Your Own Server</h2>
            <p className="text-sm opacity-70 mb-4">Advanced method, full control</p>
            
            <p className="mb-4">
              Run your own overlay/paymail server by cloning and deploying our open-source implementation.
              This gives you full control over the experience.
            </p>
            
            <h3 className="font-bold mt-4">Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 mb-4">
              <li>
                Clone our repository:
                <div className="bg-base-300 p-2 rounded mt-1 font-mono text-sm whitespace-pre-wrap">
                  git clone https://github.com/b-open-io/opns-overlay
                </div>
              </li>
              <li>
                Follow the setup instructions in the README.
              </li>
              <li>
                Configure your DNS to point to your server.
              </li>
              <li>
                Launch your service.
              </li>
            </ol>
            
            <div className="card-actions justify-end mt-4">
              <a 
                href="https://github.com/b-open-io/opns-overlay"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                View Repository
              </a>
            </div>
          </div>
        </div>
      </div>
      
      <div className="card bg-base-300 shadow-xl mb-8">
        <div className="card-body">
          <h2 className="card-title">Need Help?</h2>
          <p>
            If you need assistance setting up 1sat names on your domain, feel free to reach out to our team.
            We're happy to help you get started.
          </p>
          <div className="card-actions justify-end">
            <a 
              href="mailto:support@1sat.name"
              className="btn btn-outline"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
      
      <div className="text-center">
        <Link to="/domains" className="btn btn-ghost">
          ← Back to Domains
        </Link>
      </div>
    </div>
  );
};

export default DomainSetupPage; 
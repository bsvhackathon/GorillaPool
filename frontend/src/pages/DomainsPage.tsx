import type { FC } from 'react';
import { Link } from 'react-router-dom';

// Domain interface
interface Domain {
  name: string;
  url: string;
  description: string;
}

// Hardcoded list of domains that support the protocol
const SUPPORTED_DOMAINS: Domain[] = [
  {
    name: '1sat.name',
    url: 'https://1sat.name',
    description: 'The original 1sat name service'
  },
  {
    name: '1sat.app',
    url: 'https://1sat.market',
    description: 'Operated by 1sat.market'
  },
  {
    name: 'yours.org',
    url: 'https://yours.org',
    description: 'Yours Wallet (Browser extension)'
  }
];

const DomainsPage: FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold merriweather-bold mb-6">Supported Domains</h1>
      
      <p className="mb-6">
        These domains support the 1sat name resolution. Your names work across all of them. Make sure you trust the domain you decide to use.
      </p>
      
      <div className="overflow-x-auto mb-8">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Description</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_DOMAINS.map((domain) => (
              <tr key={domain.name}>
                <td className="font-bold">{domain.name}</td>
                <td>{domain.description}</td>
                <td className="text-right">
                  <a 
                    href={domain.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-primary"
                  >
                    Visit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body text-center">
          <h2 className="card-title justify-center text-2xl mb-2">Want to add your domain?</h2>
          <p className="mb-4">
            You can add support for 1sat names on your own domain by following our simple setup guide.
          </p>
          <div className="card-actions justify-center">
            <Link to="/domain-setup" className="btn btn-accent">
              Add Your Domain
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DomainsPage; 
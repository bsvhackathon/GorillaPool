import { priceUsd } from '../constants';
import { ThemeSelector } from './ThemeSelector';

const Settings = () => {
  return (
    <div className="card bg-base-200 shadow-xl mb-8 max-w-4xl mx-auto">
      <div className="card-body">
        <div className="flex justify-between items-center mb-6">
          <h2 className="card-title">
            <span className="text-3xl text-primary">Settings</span>
          </h2>
        </div>
        
        <div className="space-y-8">
          {/* Theme Settings */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-base-content">Appearance</h3>
            <div className="bg-base-100 p-4 rounded-lg shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-base-content">Theme</p>
                  <p className="text-sm text-base-content/70">Customize the look and feel of the application</p>
                </div>
                <ThemeSelector />
              </div>
            </div>
          </div>
          
          {/* About Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-base-content">About</h3>
            <div className="bg-base-100 p-4 rounded-lg shadow-sm">
              <p className="mb-2 text-base-content">
                <span className="text-primary">1SAT.NAME</span> is a paymail name miner and resolution service built on Bitcoin SV and 1Sat Ordinals.
              </p>
              <p className="mb-2 text-base-content">Register your unique name for just ${priceUsd}.</p>
              <p className="text-sm text-base-content/70">Version 1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 
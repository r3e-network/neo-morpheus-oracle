import { execSync } from 'node:child_process';

console.log('Compiling Neo X contracts...');
execSync('npm install', { cwd: 'contracts/neox', stdio: 'inherit' });
execSync('npx hardhat compile', { cwd: 'contracts/neox', stdio: 'inherit' });
console.log('Neo X contracts compiled. Use a deployment plugin or wallet flow to deploy artifacts from contracts/neox/artifacts.');

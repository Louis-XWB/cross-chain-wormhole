# Cross-Chain Staking Application

A decentralized application that leverages the Wormhole protocol to enable cross-chain token staking. This application allows users to transfer SOL from Solana to Ethereum's Sepolia testnet, stake the wrapped SOL tokens, and receive loan tokens in return, with full unstaking capability.

## Features

- **Cross-Chain Transfer**: Transfer SOL from Solana to Ethereum Sepolia testnet
- **Automated Staking**: Automatically stake wrapped SOL tokens upon arrival on the destination chain
- **Loan Token Minting**: Receive CCLT loan tokens proportional to your staked amount
- **Complete Unstaking**: Fully unstake your assets, return loan tokens, and reclaim your wrapped SOL
- **Real-time Monitoring**: Track the progress of all operations through a real-time log system
- **Status Checking**: View your current staking and loan positions at any time

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- Solana wallet with SOL tokens
- Ethereum wallet with testnet ETH for gas fees
- Basic understanding of blockchain and cross-chain operations

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cross-chain-staking-app.git
cd cross-chain-staking-app
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Create a `.env` file with the following variables:
```
# Solana wallet private key
SOL_PRIVATE_KEY=your_solana_private_key

# Ethereum wallet private key
ETH_PRIVATE_KEY=your_ethereum_private_key

# RPC URLs
NEXT_PUBLIC_ETH_RPC_URL=https://sepolia.infura.io/v3/your_infura_key
NEXT_PUBLIC_SOL_RPC_URL=https://api.devnet.solana.com
```

## Usage

1. Start the application:
```bash
npm run build
npm start
```

2. Navigate to `http://localhost:3000` in your browser.

3. The application interface provides three main functions:
   - **Stake**: Enter an amount of SOL to transfer and stake
   - **Unstake**: Return loan tokens and reclaim your staked assets
   - **Check Status**: View your current staking position

## Staking Process

1. When you initiate staking, the following occurs:
   - SOL is transferred from your Solana wallet to the Wormhole bridge
   - The bridge mints wrapped SOL tokens on Ethereum
   - These tokens are automatically staked in the staking contract
   - Loan tokens (CCLT) are minted and sent to your Ethereum wallet

2. The entire process is monitored and logged in real-time.

## Unstaking Process

1. When you initiate unstaking, the following occurs:
   - Your loan tokens are returned to the staking contract
   - The staking contract burns these tokens
   - Your wrapped SOL tokens are released back to your wallet
   - The entire process is monitored and logged in real-time

## Technical Architecture

### Smart Contracts

- **Staking Contract**: Manages the staking logic, including depositing and withdrawing assets
- **Loan Token Contract**: ERC-20 token that represents the loan position

### Backend

- Node.js server with Express
- Wormhole SDK for cross-chain communication
- Ethers.js for Ethereum interactions

### Frontend

- Simple HTML/CSS/JavaScript interface
- Real-time log streaming with Server-Sent Events (SSE)

## Development

The project structure is organized as follows:

```
/
├── public/               # Frontend assets
├── src/                  # Backend source code
│   ├── helpers/          # Helper utilities
│   ├── server.ts         # Express server
│   └── cross-chain-staking.ts # Core staking logic
├── contract/             # Smart contract source code
├── .env                  # Environment variables
└── package.json          # Project dependencies
```

## Security Considerations

- Private keys in the `.env` file are sensitive. Never commit this file to version control.
- This application is for educational purposes and testnet use only.
- Always perform proper security audits before using in production.

## Troubleshooting

Common issues and solutions:

- **Transaction Failed**: Make sure you have enough SOL/ETH for transaction fees
- **Unstaking Failed**: Ensure you have all the loan tokens in your wallet
- **Connection Issues**: Check that your RPC endpoints are correct and functional


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License. 
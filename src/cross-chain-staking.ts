import {
    Chain,
    Network,
    Wormhole,
    amount,
    wormhole,
    TokenId,
    TokenTransfer,
  } from "@wormhole-foundation/sdk";
  import evm from "@wormhole-foundation/sdk/evm";
  import solana from "@wormhole-foundation/sdk/solana";
  import sui from "@wormhole-foundation/sdk/sui";
  import { SignerStuff, getSigner, getTokenDecimals } from "./helpers/helpers";
  import { ethers } from "ethers";
  import { config } from "dotenv";
  
  // Load environment variables
  config();
  
  // Contract addresses
  const STAKING_CONTRACT_ADDRESS = "0xfb06c3cd43d8b15c580a196e12ba80d42ffc02cd";
  const LOAN_TOKEN_ADDRESS = "0x8c25f65249f568033697a5d06f907f4dafafdeb5";
  const WRAPPED_SOL_ADDRESS = "0x824CB8fC742F8D3300d29f16cA8beE94471169f5";
  
  // Contract ABIs
  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
  ];
  
  const STAKING_ABI = [
    "function stake(uint256 amount) external",
    "function unstake(uint256 amount) external",
    "function getUserStake(address user) external view returns (uint256 stakedAmount, uint256 loanedAmount)",
  ];
  
  // Main function - only executed when running the script directly
  if (require.main === module) {
    (async function () {
      console.log("Starting cross-chain staking process...");
      
      try {
        // 1. Execute cross-chain transfer
        const crossChainResult = await executeCrossChainTransfer();
        console.log("Cross-chain transfer completed, waiting for assets to reach the destination chain...");
        
        // Wait for a while to ensure the assets have arrived
        console.log("Waiting 30 seconds to ensure assets have arrived...");
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // 2. Execute staking operation
        await executeStaking(crossChainResult.destinationAddress);
        
        console.log("The entire cross-chain staking process has been completed!");
      } catch (error) {
        console.error("Error during execution:", error);
      }
      
      process.exit(0);
    })();
  }
  
  // Execute cross-chain transfer
  export async function executeCrossChainTransfer(amt: string = "0.01") {
    console.log("Starting cross-chain transfer...");
    
    const wh = await wormhole("Testnet", [evm, solana, sui]);
    
    // Set up source and destination chains
    const sendChain = wh.getChain("Solana");
    const rcvChain = wh.getChain("Sepolia");
    
    // Get signers
    const source = await getSigner(sendChain);
    console.log("Sender: " + source.address.address.address.toString());
    const destination = await getSigner(rcvChain);
    console.log("Receiver: " + destination.address.address.address.toString());
    
    // Get cross-chain token
    const token = Wormhole.tokenId(sendChain.chain, "native");
    console.log("Getting cross-chain token: " + token.address);
    
    // Set manual completion mode
    const automatic = false;
    
    // Get token decimals
    const decimals = await getTokenDecimals(wh, token, sendChain);
    let  srcTxids = [''];
    try{
        // Execute token transfer
        srcTxids  = await tokenTransfer(wh, {
            token,
            amount: amount.units(amount.parse(amt, decimals)),
            source,
            destination,
            automatic,
         });
    }catch(e){
      console.log(e);
    }
    
    
    return {
      sourceAddress: source.address.address.address.toString(),
      destinationAddress: destination.address.address.address.toString(),
      amount: amt,
      wormholeHash: srcTxids[0],
    };
  }
  
  // Add retry logic example
  async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 5, delay = 3000): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: unknown) {
        console.log(`Attempt ${i+1}/${maxRetries} failed: ${error instanceof Error ? error.message : String(error)}`);
        lastError = error;
        if (i < maxRetries - 1) {
          console.log(`Waiting ${delay/1000} seconds before retrying...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          // Increase retry delay to avoid frequent requests
          delay = Math.min(delay * 1.5, 15000);
        }
      }
    }
    throw lastError;
  }
  
  // Execute staking operation
  export async function executeStaking(userAddress: string) {
    console.log("Starting staking operation...");
    
    // Get Ethereum private key
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing ETH_PRIVATE_KEY environment variable");
    }
    
    try {
      // Connect to Sepolia network with request options
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_ETH_RPC_URL,
        undefined,
        { 
          staticNetwork: true,
          polling: true,
          pollingInterval: 4000,
          cacheTimeout: 30000
        }
      );
      
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Connect to loan token contract
      const loanTokenAbi = [
        "function addMinter(address minter) external",
        "function minters(address minter) external view returns (bool)"
      ];
      const loanTokenContract = new ethers.Contract(LOAN_TOKEN_ADDRESS, loanTokenAbi, wallet);

      // Check if the staking contract is already a minter
      const isMinter = await executeWithRetry(() => 
        loanTokenContract.minters(STAKING_CONTRACT_ADDRESS)
      );
      
      if (!isMinter) {
        console.log("Staking contract is not a minter, adding minting permission...");
        const addMinterTx = await executeWithRetry(() => 
          loanTokenContract.addMinter(STAKING_CONTRACT_ADDRESS)
        );
        console.log(`Add minter transaction submitted, transaction hash: ${addMinterTx.hash}`);
        await executeWithRetry(() => addMinterTx.wait());
        console.log("Add minter transaction confirmed");
      } else {
        console.log("Staking contract is already a minter");
      }
      
      // Connect to contracts
      const wrappedSolContract = new ethers.Contract(WRAPPED_SOL_ADDRESS, ERC20_ABI, wallet);
      const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, wallet);
      
      // Check Wrapped SOL balance
      const balance = await executeWithRetry(() => 
        wrappedSolContract.balanceOf(userAddress)
      );
      const decimals = await executeWithRetry(() => 
        wrappedSolContract.decimals()
      );
      console.log(`Wrapped SOL balance: ${ethers.formatUnits(balance, decimals)} SOL`);
      
      if (balance > 0n) {
        // Approve staking contract to use Wrapped SOL
        console.log("Approving staking contract to use Wrapped SOL...");
        const approveTx = await executeWithRetry(() => 
          wrappedSolContract.approve(STAKING_CONTRACT_ADDRESS, balance)
        );
        console.log(`Approval transaction submitted, transaction hash: ${approveTx.hash}`);
        await executeWithRetry(() => approveTx.wait());
        console.log("Approval transaction confirmed");
        
        // Execute staking
        console.log("Executing staking operation...");
        const stakeTx = await executeWithRetry(() => 
          stakingContract.stake(balance)
        );
        console.log(`Staking transaction submitted, transaction hash: ${stakeTx.hash}`);
        await executeWithRetry(() => stakeTx.wait());
        console.log("Staking transaction confirmed");
        
        // Query staking status
        const [stakedAmount, loanedAmount] = await executeWithRetry(() => 
          stakingContract.getUserStake(userAddress)
        );
        console.log(`Staking status:`);
        console.log(`- Staked amount: ${ethers.formatUnits(stakedAmount, decimals)} SOL`);
        console.log(`- Loaned amount: ${ethers.formatUnits(loanedAmount, 18)} CCLT`);
        
        return {
          stakedAmount: ethers.formatUnits(stakedAmount, decimals),
          loanedAmount: ethers.formatUnits(loanedAmount, 18),
        };
      } else {
        console.log("No Wrapped SOL to stake, please ensure cross-chain transfer was successful");
        return null;
      }
    } catch (error) {
      console.error("Staking operation failed:", error);
      throw error;
    }
  }
  
  // Query staking status
  export async function getStakeInfo() {
    console.log("Starting to query staking status...");
    
    // Get Ethereum private key
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing ETH_PRIVATE_KEY environment variable");
    }
    
    try {
      // Connect to Sepolia network
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_ETH_RPC_URL,
        undefined,
        { 
          staticNetwork: true,
          polling: true,
          pollingInterval: 4000,
          cacheTimeout: 30000
        }
      );
      
      const wallet = new ethers.Wallet(privateKey, provider);
      const userAddress = wallet.address;
      
      console.log(`Querying staking status for user ${userAddress}...`);
      
      // Connect to contracts
      const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, wallet);
      const wrappedSolContract = new ethers.Contract(WRAPPED_SOL_ADDRESS, ERC20_ABI, wallet);
      
      // Query staking status
      const [stakedAmount, loanedAmount] = await executeWithRetry(() => 
        stakingContract.getUserStake(userAddress)
      );
      
      // Get token decimals
      const decimals = await executeWithRetry(() => 
        wrappedSolContract.decimals()
      );
      
      console.log(`Staking status:`);
      console.log(`- Staked amount: ${ethers.formatUnits(stakedAmount, decimals)} SOL`);
      console.log(`- Loaned amount: ${ethers.formatUnits(loanedAmount, 18)} CCLT`);
      
      return {
        stakedAmount: ethers.formatUnits(stakedAmount, decimals),
        loanedAmount: ethers.formatUnits(loanedAmount, 18),
      };
    } catch (error) {
      console.error("Failed to query staking status:", error);
      throw error;
    }
  }
  
  // Unstake
  export async function executeUnstake() {
    console.log("Starting unstaking operation...");
    
    // Get Ethereum private key
    const privateKey = process.env.ETH_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing ETH_PRIVATE_KEY environment variable");
    }
    
    try {
      // Connect to Sepolia network
      const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_ETH_RPC_URL,
        undefined,
        { 
          staticNetwork: true,
          polling: true,
          pollingInterval: 4000,
          cacheTimeout: 30000
        }
      );
      
      const wallet = new ethers.Wallet(privateKey, provider);
      const userAddress = wallet.address;
      
      // Connect to contracts
      const wrappedSolContract = new ethers.Contract(WRAPPED_SOL_ADDRESS, ERC20_ABI, wallet);
      const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, wallet);
      const loanTokenContract = new ethers.Contract(LOAN_TOKEN_ADDRESS, ERC20_ABI, wallet);
      
      // Query staking status
      const [stakedAmount, loanedAmount] = await executeWithRetry(() => 
        stakingContract.getUserStake(userAddress)
      );
      
      const decimals = await executeWithRetry(() => 
        wrappedSolContract.decimals()
      );
      
      console.log(`Current staking status:`);
      console.log(`- Staked amount: ${ethers.formatUnits(stakedAmount, decimals)} SOL`);
      console.log(`- Loaned amount: ${ethers.formatUnits(loanedAmount, 18)} CCLT`);
      
      if (stakedAmount <= 0n) {
        console.log("No stakes to unstake");
        return null;
      }
      
      // Check loan token balance to ensure there are enough tokens to return
      const loanBalance = await executeWithRetry(() => 
        loanTokenContract.balanceOf(userAddress)
      );
      
      console.log(`Loan token balance: ${ethers.formatUnits(loanBalance, 18)} CCLT`);
      
      if (loanBalance < loanedAmount) {
        throw new Error(`Insufficient loan token balance, cannot unstake. Need ${ethers.formatUnits(loanedAmount, 18)} CCLT but only have ${ethers.formatUnits(loanBalance, 18)} CCLT`);
      }
      
      // Approve staking contract to use loan tokens
      console.log("Approving staking contract to use loan tokens...");
      const approveTx = await executeWithRetry(() => 
        loanTokenContract.approve(STAKING_CONTRACT_ADDRESS, loanedAmount)
      );
      console.log(`Approval transaction submitted, transaction hash: ${approveTx.hash}`);
      await executeWithRetry(() => approveTx.wait());
      console.log("Approval transaction confirmed");
      
      // Execute unstaking
      console.log("Executing unstaking operation...");
      const unstakeTx = await executeWithRetry(() => 
        stakingContract.unstake(stakedAmount)
      );
      console.log(`Unstaking transaction submitted, transaction hash: ${unstakeTx.hash}`);
      await executeWithRetry(() => unstakeTx.wait());
      console.log("Unstaking transaction confirmed");
      
      // Query new Wrapped SOL balance
      const newBalance = await executeWithRetry(() => 
        wrappedSolContract.balanceOf(userAddress)
      );
      console.log(`Wrapped SOL balance after unstaking: ${ethers.formatUnits(newBalance, decimals)} SOL`);
      
      // Check staking status to confirm it has been released
      const [newStakedAmount, newLoanedAmount] = await executeWithRetry(() => 
        stakingContract.getUserStake(userAddress)
      );
      
      console.log(`New staking status:`);
      console.log(`- Staked amount: ${ethers.formatUnits(newStakedAmount, decimals)} SOL`);
      console.log(`- Loaned amount: ${ethers.formatUnits(newLoanedAmount, 18)} CCLT`);
      
      // Return unstaking result
      return {
        withdrawnAmount: ethers.formatUnits(stakedAmount, decimals),
        newStakedAmount: ethers.formatUnits(newStakedAmount, decimals),
        newLoanedAmount: ethers.formatUnits(newLoanedAmount, 18)
      };
    } catch (error) {
      console.error("Unstaking operation failed:", error);
      throw error;
    }
  }
  
  // Cross-chain transfer function
  async function tokenTransfer<N extends Network>(
    wh: Wormhole<N>,
    route: {
      token: TokenId;
      amount: bigint;
      source: SignerStuff<N, Chain>;
      destination: SignerStuff<N, Chain>;
      automatic: boolean;
      payload?: Uint8Array;
    }
  ) {
    const xfer = await wh.tokenTransfer(
      route.token,
      route.amount,
      route.source.address,
      route.destination.address,
      route.automatic ?? false,
      route.payload
    );
   
    const quote = await TokenTransfer.quoteTransfer(
      wh,
      route.source.chain,
      route.destination.chain,
      xfer.transfer
    );
    
    if (xfer.transfer.automatic && quote.destinationToken.amount < 0)
      throw "The amount requested is too low to cover the fee and any native gas requested.";
    
    const srcTxids = await xfer.initiateTransfer(route.source.signer);
    console.log("Executing cross-chain operation and returning monitoring hash:");
    console.log(`Wormhole Hash: ${srcTxids[0]}`);
    console.log(`Wormhole Hash: ${srcTxids[1] ?? srcTxids[0]}`);
   
    console.log("Querying cross-chain proof...");
    const attestIds = await xfer.fetchAttestation(60_000);
    console.log("Cross-chain proof query completed:", attestIds);
    console.log("Cross-chain proof query completed");
    
    try {
      const destTxids = await xfer.completeTransfer(route.destination.signer);
      console.log(`Cross-chain transfer completed, hash: `, destTxids);
    } catch (error: any) {
      // Check if it's a "transfer already completed" error
      if (error.toString().includes("transfer already completed")) {
        console.log("Transfer has already been completed, possibly automatically by a relayer or successfully completed previously");
        console.log("This is not an error, your assets should have reached the destination chain");
      } else {
        throw error;
      }
    }
    
    return srcTxids;
  }
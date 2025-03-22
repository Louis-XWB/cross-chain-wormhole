import express, { Request, Response } from 'express';
import path from 'path';
import { config } from 'dotenv';
import { executeCrossChainTransfer, executeStaking, executeUnstake, getStakeInfo } from './cross-chain-staking';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store connected clients
const clients: { id: string; response: Response }[] = [];

// Save original console.log
const originalConsoleLog = console.log;

// Send logs to all connected clients
function sendLogToAll(message: string) {
  // Use original console.log to avoid recursive calls
  originalConsoleLog(message);
  clients.forEach(client => {
    try {
      client.response.write(`data: ${message}\n\n`);
    } catch (error) {
      // Ignore errors from closed connections
      originalConsoleLog(`Failed to send log: ${error}`);
    }
  });
}

// Redirect console output to clients
console.log = function(...args: any[]) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ');
  sendLogToAll(message);
};

// SSE endpoint - for real-time logs
app.get('/api/logs', (req: Request, res: Response) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Send initial message
  res.write('data: Connected to log stream\n\n');
  
  // Generate client ID
  const clientId = Date.now().toString();
  
  // Add new client
  clients.push({ id: clientId, response: res });
  
  // Remove client when connection is closed
  req.on('close', () => {
    const index = clients.findIndex(client => client.id === clientId);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// API endpoint - Execute cross-chain staking
app.post('/api/cross-chain-stake', async (req: Request, res: Response) => {
  // Set request timeout to 10 minutes
  req.setTimeout(600000);
  
  try {
    const { amount } = req.body;
    
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid amount' });
    }
    
    // Modify cross-chain transfer function to accept amount parameter
    const crossChainResult = await executeCrossChainTransfer(amount);
    
    // Wait for a while to ensure the assets have arrived
    console.log("Waiting 30 seconds to ensure assets have arrived...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Execute staking operation
    const stakingResult = await executeStaking(crossChainResult.destinationAddress);
    
    return res.json({
      success: true,
      message: 'Cross-chain staking operation completed successfully',
      sourceAddress: crossChainResult.sourceAddress,
      destinationAddress: crossChainResult.destinationAddress,
      amount: crossChainResult.amount,
      wormholeHash: crossChainResult.wormholeHash,
      stakedAmount: stakingResult?.stakedAmount,
      loanedAmount: stakingResult?.loanedAmount
    });
  } catch (error: any) {
    console.error('API error:', error);
    
    // Ensure client receives error response
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Error executing cross-chain staking'
      });
    }
  }
});

// API endpoint - Unstake
app.post('/api/unstake', async (req: Request, res: Response) => {
  // Set request timeout to 10 minutes
  req.setTimeout(600000);
  
  try {
    console.log("Starting unstaking operation...");
    
    // Execute unstaking operation
    const result = await executeUnstake();
    
    if (result) {
      return res.json({
        success: true,
        message: 'Unstaking operation completed successfully',
        withdrawnAmount: result.withdrawnAmount
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'No stakes to unstake'
      });
    }
  } catch (error: any) {
    console.error('API error:', error);
    
    // Ensure client receives error response
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Error executing unstaking'
      });
    }
  }
});

// API endpoint - Query staking status
app.get('/api/stake-info', async (req: Request, res: Response) => {
  try {
    console.log("Starting to query staking status...");
    
    // Get staking information
    const stakeInfo = await getStakeInfo();
    
    return res.json({
      success: true,
      message: 'Staking status query successful',
      stakedAmount: stakeInfo.stakedAmount,
      loanedAmount: stakeInfo.loanedAmount
    });
  } catch (error: any) {
    console.error('API error:', error);
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Error querying staking status'
    });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Set server timeout
server.timeout = 600000; // 10 minutes

// Handle process termination signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT signal, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Don't exit immediately, allow time for logs to be sent
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise rejection:', reason);
}); 
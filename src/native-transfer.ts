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
  import { SignerStuff, getSigner, getTokenDecimals } from "./helpers/helpers"
   
  (async function () {
    const wh = await wormhole("Testnet", [evm, solana, sui]);
   
    // Set up source and destination chains
    // const sendChain = wh.getChain("Sepolia");
    // const rcvChain = wh.getChain("Solana");
    const sendChain = wh.getChain("Solana");
    const rcvChain = wh.getChain("Sepolia");
    
   
    // Get signer from local key but anything that implements
    const source = await getSigner(sendChain);
    console.log("发送者:" + source.address.address.address.toString());
    const destination = await getSigner(rcvChain);
    console.log("接收者:" + destination.address.address.address.toString());
    // Shortcut to allow transferring native gas token
    const token = Wormhole.tokenId(sendChain.chain, "native");
    console.log("获取跨链token:" + token.address);
    // Define the amount of tokens to transfer
    const amt = "0.01";
   
    // Set automatic transfer to false for manual transfer
    const automatic = false;
   
    // Used to normalize the amount to account for the tokens decimals
    const decimals = await getTokenDecimals(wh, token, sendChain);
   
    // Perform the token transfer if no recovery transaction ID is provided
    const xfer = await tokenTransfer(wh, {
      token,
      amount: amount.units(amount.parse(amt, decimals)),
      source,
      destination,
      automatic,
    });
    process.exit(0);
  })();
   
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
    console.log("执行跨链操作并返回监听hash:");
    console.log(`Wormhole Hash: ${srcTxids[0]}`);
    console.log(`Wormhole Hash: ${srcTxids[1] ?? srcTxids[0]}`);
   
    console.log("查询跨链证明中.....");
    const attestIds = await xfer.fetchAttestation(60_000);
    console.log("查询跨链证明完成：",attestIds);
    const destTxids = await xfer.completeTransfer(route.destination.signer);
    console.log(`跨链完成,跨链hash: `, destTxids);
  }
import { TonClient, WalletContractV4, WalletContractV5R1, internal, toNano, Address, beginCell } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

// Official GRAM Token Master Address on TON
const GRAM_MASTER_ADDRESS = Address.parse("EQC47093oX5Xhb0xuk2hCr2OnkWyt9jiWqKazWNYqnOwf-AO");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const params = req.method === "POST" ? req.body : req.query;
  const { seed, to, amount, comment } = params || {};

  if (!seed || !to || !amount) {
    return res.status(400).json({
      ok: false,
      error: "Missing parameters: 'seed', 'to', and 'amount' are required."
    });
  }

  try {
    const mnemonic = decodeURIComponent(seed).trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    const client = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    const workchain = 0;
    
    // Tonkeeper W5 এবং V4 দুটোই চেক করা
    let wallet = WalletContractV5R1.create({ workchain, publicKey: keyPair.publicKey });
    let contract = client.open(wallet);
    let seqno = 0;

    try {
      seqno = await contract.getSeqno();
    } catch (e) {
      // W5 এ না পেলে V4 ট্রাই করবে
      wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
      contract = client.open(wallet);
      seqno = await contract.getSeqno();
    }

    // ১. GRAM Jetton ওয়ালেট বের করা
    const jettonData = await client.runMethod(GRAM_MASTER_ADDRESS, "get_wallet_address", [
      { type: "slice", cell: beginCell().storeAddress(wallet.address).endCell() }
    ]);
    const senderJettonWallet = jettonData.stack.readAddress();

    // ২. মেমো তৈরি
    const forwardPayload = beginCell()
      .storeUint(0, 32)
      .storeStringTail(comment ? comment.toString() : "GRAM Payout")
      .endCell();

    // ৩. Jetton Transfer Payload
    const jettonTransferBody = beginCell()
      .storeUint(0xf8a70085, 32)
      .storeUint(0, 64)
      .storeCoins(toNano(amount.toString()))
      .storeAddress(Address.parse(to.trim()))
      .storeAddress(wallet.address)
      .storeBit(0)
      .storeCoins(toNano("0.01"))
      .storeBit(1)
      .storeRef(forwardPayload)
      .endCell();

    // ৪. সেন্ড করা
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: senderJettonWallet,
          value: toNano("0.05"),
          body: jettonTransferBody,
          bounce: true
        })
      ]
    });

    return res.status(200).json({
      ok: true,
      status: "success",
      message: "GRAM Token sent successfully",
      tx_hash: `GRAM_${Date.now()}`
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to process GRAM transaction"
    });
  }
}

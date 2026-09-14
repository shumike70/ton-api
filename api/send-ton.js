import { TonClient, WalletContractV4, WalletContractV5R1, internal, toNano, fromNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

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

    // Tonkeeper এর W5 এবং V4 দুটোই অটো-ডিটেক্ট করবে
    let wallet = WalletContractV5R1.create({ workchain, publicKey: keyPair.publicKey });
    let contract = client.open(wallet);
    let balance = await contract.getBalance();

    // W5 এ ব্যালেন্স না পেলে V4R2 চেক করবে
    if (balance === 0n) {
      const v4Wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
      const v4Contract = client.open(v4Wallet);
      const v4Balance = await v4Contract.getBalance();
      if (v4Balance > 0n) {
        wallet = v4Wallet;
        contract = v4Contract;
        balance = v4Balance;
      }
    }

    const seqno = await contract.getSeqno().catch(() => 0);

    // সরাসরি ব্যালেন্স থেকে ট্রান্সফার
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: to.trim(),
          value: toNano(amount.toString()),
          body: comment ? comment.toString() : "GRAM Transfer",
          bounce: false
        })
      ]
    });

    return res.status(200).json({
      ok: true,
      status: "success",
      detected_balance: fromNano(balance),
      tx_hash: `GRAM_${Date.now()}`
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to process transaction"
    });
  }
}

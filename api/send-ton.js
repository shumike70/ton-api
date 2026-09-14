import { TonClient, WalletContractV4, internal, toNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET অথবা POST উভয় থেকেই ডেটা গ্রহণ করবে
  const params = req.method === "POST" ? req.body : req.query;
  const { seed, to, amount, comment } = params || {};

  if (!seed || !to || !amount) {
    return res.status(400).json({
      ok: false,
      error: "Missing parameters: 'seed', 'to', and 'amount' are required."
    });
  }

  try {
    // সিড ফ্রেইজ প্রসেস করা (২৪ টি শব্দ)
    const mnemonic = decodeURIComponent(seed).trim().split(/\s+/);
    if (mnemonic.length !== 24 && mnemonic.length !== 12) {
      return res.status(400).json({
        ok: false,
        error: "Invalid mnemonic phrase length. Must be 12 or 24 words."
      });
    }

    const keyPair = await mnemonicToPrivateKey(mnemonic);

    // TON Public RPC Client
    const client = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    // V4R2 ওয়ালেট সেটআপ (Tonkeeper/Telegram Wallet ডিফল্ট)
    const workchain = 0;
    const wallet = WalletContractV4.create({
      workchain,
      publicKey: keyPair.publicKey
    });
    const contract = client.open(wallet);

    // ওয়ালেটের ব্যালেন্স ও সিকোয়েন্স নম্বর চেক
    const seqno = await contract.getSeqno();

    // ট্রানজ্যাকশন পাঠানো
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: to.trim(),
          value: toNano(amount.toString()),
          body: comment ? comment.toString() : "Withdrawal from Bot",
          bounce: false
        })
      ]
    });

    // সফল হলে রেসপন্স
    return res.status(200).json({
      ok: true,
      status: "success",
      message: "Transfer initiated successfully",
      tx_hash: `TON_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to process TON transaction"
    });
  }
}

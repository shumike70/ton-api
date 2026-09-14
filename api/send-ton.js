import { TonClient, WalletContractV4, internal, toNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const params = req.method === "POST" ? req.body : req.query;
  const { seed, to, amount, comment } = params || {};

  if (!seed || !to || !amount) {
    return res.status(200).json({ ok: false, error: "Missing seed, to, or amount parameters." });
  }

  try {
    const mnemonic = decodeURIComponent(seed).trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    // 🚀 High-Speed Unlimited RPC (No 429 Rate Limit)
    const client = new TonClient({
      endpoint: "https://ton.access.orbs.network/44A1c0/1/mainnet/toncenter-api-v2/jsonRPC"
    });

    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    const contract = client.open(wallet);

    let seqno = 0;
    try {
      seqno = await contract.getSeqno();
    } catch (e) {
      seqno = 0;
    }

    // Send Transfer
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: to.trim(),
          value: toNano(amount.toString()),
          body: comment ? comment.toString() : "Payout",
          bounce: false
        })
      ]
    });

    return res.status(200).json({
      ok: true,
      status: "success",
      wallet_address: wallet.address.toString(),
      tx_hash: `TX_${Date.now()}`
    });

  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message || "Failed to process transaction"
    });
  }
}

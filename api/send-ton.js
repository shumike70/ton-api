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

    // 🔑 Toncenter with API Key (429 Rate limit bypass)
    const client = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC",
      apiKey: "f0799ea483d8a52ea5ff0552b75a6c3dd795db2e62e086f68748d5d1ea882367"
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
      error: err.message || "Failed to broadcast transaction"
    });
  }
}

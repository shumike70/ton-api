import { TonClient4, WalletContractV4, internal, toNano, fromNano } from "@ton/ton";
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

    const client = new TonClient4({
      endpoint: "https://mainnet-v4.tonhubapi.com"
    });

    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    const contract = client.open(wallet);

    // চেক করা সেন্ডার ওয়ালেটে ব্যালেন্স আছে কিনা
    const balance = await contract.getBalance();
    const balanceInTon = parseFloat(fromNano(balance));

    if (balanceInTon < parseFloat(amount)) {
      return res.status(200).json({
        ok: false,
        error: `Insufficient Sender Balance! Your Bot Sender Wallet (${wallet.address.toString()}) has only ${balanceInTon} TON. Please deposit funds into this address.`
      });
    }

    const seqno = await contract.getSeqno().catch(() => 0);

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
      sender_wallet: wallet.address.toString(),
      tx_hash: `https://tonscan.org/address/${wallet.address.toString()}`
    });

  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message || "Failed to broadcast transaction"
    });
  }
}

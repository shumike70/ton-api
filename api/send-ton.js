import { TonClient4, WalletContractV5R1, internal, toNano, fromNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const params = req.method === "POST" ? req.body : req.query;
  const { seed, to, amount, comment } = params || {};

  if (!seed || !to || !amount) {
    return res.status(200).json({ ok: false, error: "Missing parameters: 'seed', 'to', or 'amount'." });
  }

  try {
    const mnemonic = decodeURIComponent(seed).trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    const client = new TonClient4({
      endpoint: "https://mainnet-v4.tonhubapi.com"
    });

    const workchain = 0;
    // 💎 সরাসরি আপনার বর্তমান Tonkeeper W5 ওয়ালেট ব্যবহার করা
    const wallet = WalletContractV5R1.create({ workchain, publicKey: keyPair.publicKey });
    const contract = client.open(wallet);

    const balance = await contract.getBalance();
    const balanceInTon = parseFloat(fromNano(balance));

    if (balanceInTon < parseFloat(amount)) {
      return res.status(200).json({
        ok: false,
        error: `Insufficient Balance! Your current Tonkeeper Wallet (${wallet.address.toString()}) has only ${balanceInTon} balance.`
      });
    }

    const seqno = await contract.getSeqno().catch(() => 0);

    // Send Transfer from your current wallet
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: to.trim(),
          value: toNano(amount.toString()),
          body: comment ? comment.toString() : "GRAM Payout",
          bounce: false
        })
      ]
    });

    return res.status(200).json({
      ok: true,
      status: "success",
      wallet_address: wallet.address.toString(),
      tx_hash: `https://tonscan.org/address/${wallet.address.toString()}`
    });

  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message || "Failed to process transaction"
    });
  }
}

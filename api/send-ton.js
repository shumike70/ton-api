const TonWeb = require("tonweb");
const tonMnemonic = require("tonweb-mnemonic");

module.exports = async (req, res) => {
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

    // ২৪ শব্দ ঠিক আছে কিনা ভ্যালিডেট করা
    const isValid = await tonMnemonic.validateMnemonic(mnemonic);
    if (!isValid) {
      return res.status(200).json({
        ok: false,
        error: "Your 24-word Seed phrase is INVALID! Please check spelling in Tonkeeper Backup."
      });
    }

    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonic);
    const tonweb = new TonWeb(new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC"));

    const WalletClass = tonweb.wallet.all.v4R2;
    const wallet = new WalletClass(tonweb.provider, {
      publicKey: keyPair.publicKey,
      wc: 0
    });

    const walletAddress = await wallet.getAddress();
    let seqno = 0;
    try {
      seqno = (await wallet.methods.seqno().call()) || 0;
    } catch (e) {
      seqno = 0;
    }

    // ট্রানজ্যাকশন তৈরি ও সেন্ড করা
    const transfer = wallet.methods.transfer({
      secretKey: keyPair.secretKey,
      toAddress: to.trim(),
      amount: TonWeb.utils.toNano(amount.toString()),
      seqno: seqno,
      payload: comment ? comment.toString() : "Payout",
      sendMode: 3
    });

    await transfer.send();

    return res.status(200).json({
      ok: true,
      status: "success",
      wallet_address: walletAddress.toString(true, true, true),
      tx_hash: `TX_${Date.now()}`
    });

  } catch (error) {
    return res.status(200).json({
      ok: false,
      error: error.message || "Failed to broadcast transaction"
    });
  }
};

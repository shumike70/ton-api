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
    return res.status(200).json({ ok: false, error: "Missing parameters: seed, to, or amount" });
  }

  try {
    const mnemonic = decodeURIComponent(seed).trim().split(/\s+/);
    if (mnemonic.length !== 24 && mnemonic.length !== 12) {
      return res.status(200).json({ ok: false, error: `Invalid seed length (${mnemonic.length} words)` });
    }

    const keyPair = await tonMnemonic.mnemonicToKeyPair(mnemonic);
    const tonweb = new TonWeb(new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC"));

    // Wallet V4R2
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

    // Official GRAM Token Minter
    const minterAddress = new TonWeb.utils.Address("EQC47093oX5Xhb0xuk2hCr2OnkWyt9jiWqKazWNYqnOwf-AO");
    const jettonMinter = new TonWeb.token.jetton.JettonMinter(tonweb.provider, {
      address: minterAddress
    });

    // Resolve Sender GRAM Jetton Wallet
    const jettonWalletAddress = await jettonMinter.getJettonWalletAddress(walletAddress);
    const jettonWallet = new TonWeb.token.jetton.JettonWallet(tonweb.provider, {
      address: jettonWalletAddress
    });

    // Send GRAM Transfer
    const transfer = jettonWallet.methods.transfer({
      secretKey: keyPair.secretKey,
      totalTonAmount: TonWeb.utils.toNano("0.05"),
      jettonAmount: TonWeb.utils.toNano(amount.toString()),
      toAddress: new TonWeb.utils.Address(to.trim()),
      forwardTonAmount: TonWeb.utils.toNano("0.01"),
      forwardPayload: new TextEncoder().encode(comment ? comment.toString() : "GRAM Transfer"),
      responseAddress: walletAddress,
      seqno: seqno
    });

    await transfer.send();

    return res.status(200).json({
      ok: true,
      status: "success",
      wallet_address: walletAddress.toString(true, true, true),
      tx_hash: `GRAM_${Date.now()}`
    });

  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message || "Failed to broadcast GRAM transaction"
    });
  }
};

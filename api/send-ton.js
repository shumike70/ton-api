import { TonClient, WalletContractV4, internal, toNano, Address, beginCell } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

const GRAM_MASTER = Address.parse("EQC47093oX5Xhb0xuk2hCr2OnkWyt9jiWqKazWNYqnOwf-AO");

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
    if (mnemonic.length !== 24 && mnemonic.length !== 12) {
      return res.status(200).json({ ok: false, error: `Invalid seed word count (${mnemonic.length} words). Must be 24 words.` });
    }

    let keyPair;
    try {
      keyPair = await mnemonicToPrivateKey(mnemonic);
    } catch (e) {
      return res.status(200).json({ ok: false, error: `Invalid Seed/Mnemonic phrase: ${e.message}. Please check words spelling.` });
    }

    const client = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC"
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

    // Resolve GRAM Jetton Wallet
    let senderJettonWallet;
    try {
      const jettonData = await client.runMethod(GRAM_MASTER, "get_wallet_address", [
        { type: "slice", cell: beginCell().storeAddress(wallet.address).endCell() }
      ]);
      senderJettonWallet = jettonData.stack.readAddress();
    } catch (e) {
      return res.status(200).json({
        ok: false,
        error: `Could not resolve GRAM Jetton Wallet. Wallet: ${wallet.address.toString()}`
      });
    }

    // Comment
    const forwardPayload = beginCell()
      .storeUint(0, 32)
      .storeStringTail(comment ? comment.toString() : "GRAM Payout")
      .endCell();

    // Jetton Body
    const jettonBody = beginCell()
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

    // Send
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: senderJettonWallet,
          value: toNano("0.05"),
          body: jettonBody,
          bounce: true
        })
      ]
    });

    return res.status(200).json({
      ok: true,
      status: "success",
      wallet_address: wallet.address.toString(),
      tx_hash: `GRAM_${Date.now()}`
    });

  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message || "Transaction broadcast failed"
    });
  }
}

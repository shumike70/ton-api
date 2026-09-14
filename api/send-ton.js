import { TonClient, WalletContractV4, WalletContractV5R1, internal, toNano, Address, beginCell } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

const GRAM_MASTER = Address.parse("EQC47093oX5Xhb0xuk2hCr2OnkWyt9jiWqKazWNYqnOwf-AO");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { seed, to, amount, comment } = req.method === "POST" ? req.body : req.query;

  if (!seed || !to || !amount) {
    return res.status(200).json({ ok: false, error: "Missing parameters: 'seed', 'to', or 'amount'." });
  }

  try {
    const mnemonic = decodeURIComponent(seed).trim().split(/\s+/);
    if (mnemonic.length !== 24 && mnemonic.length !== 12) {
      return res.status(200).json({ ok: false, error: `Invalid seed word count (${mnemonic.length} words). Must be 24.` });
    }

    const keyPair = await mnemonicToPrivateKey(mnemonic);

    const client = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    // 1. Check Wallet (W5 or V4)
    let wallet = WalletContractV5R1.create({ workchain: 0, publicKey: keyPair.publicKey });
    let contract = client.open(wallet);
    let seqno = 0;

    try {
      seqno = await contract.getSeqno();
    } catch (e) {
      wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
      contract = client.open(wallet);
      seqno = await contract.getSeqno().catch(() => 0);
    }

    // 2. Resolve GRAM Jetton Wallet
    let senderJettonWallet;
    try {
      const jettonData = await client.runMethod(GRAM_MASTER, "get_wallet_address", [
        { type: "slice", cell: beginCell().storeAddress(wallet.address).endCell() }
      ]);
      senderJettonWallet = jettonData.stack.readAddress();
    } catch (e) {
      return res.status(200).json({
        ok: false,
        error: `Could not find GRAM token in wallet: ${wallet.address.toString()}`
      });
    }

    // 3. Build Payload
    const forwardPayload = beginCell()
      .storeUint(0, 32)
      .storeStringTail(comment ? comment.toString() : "GRAM")
      .endCell();

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

    // 4. Send Transfer
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
    // Return error with status 200 so Telegram Bot displays the exact reason
    return res.status(200).json({
      ok: false,
      error: err.message || "Failed to broadcast transaction on TON network"
    });
  }
}

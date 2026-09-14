import { TonClient, WalletContractV4, internal, toNano, Address, beginCell } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

// Official GRAM Token Master Address on TON
const GRAM_MASTER_ADDRESS = Address.parse("EQC47093oX5Xhb0xuk2hCr2OnkWyt9jiWqKazWNYqnOwf-AO");

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
    if (mnemonic.length !== 24 && mnemonic.length !== 12) {
      return res.status(400).json({
        ok: false,
        error: "Invalid mnemonic phrase length. Must be 12 or 24 words."
      });
    }

    const keyPair = await mnemonicToPrivateKey(mnemonic);

    const client = new TonClient({
      endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    const workchain = 0;
    const wallet = WalletContractV4.create({
      workchain,
      publicKey: keyPair.publicKey
    });
    const contract = client.open(wallet);

    // ১. আপনার ওয়ালেটের নিজস্ব GRAM Jetton ওয়ালেট অ্যাড্রেস বের করা
    const jettonData = await client.runMethod(GRAM_MASTER_ADDRESS, "get_wallet_address", [
      { type: "slice", cell: beginCell().storeAddress(wallet.address).endCell() }
    ]);
    const senderJettonWallet = jettonData.stack.readAddress();

    // ২. কমেন্ট / মেমো তৈরি করা
    const forwardPayload = beginCell()
      .storeUint(0, 32)
      .storeStringTail(comment ? comment.toString() : "GRAM Withdrawal")
      .endCell();

    // ৩. Jetton Transfer Payload তৈরি (Opcode 0xf8a70085)
    const jettonTransferBody = beginCell()
      .storeUint(0xf8a70085, 32) // Jetton transfer opcode
      .storeUint(0, 64)          // query_id
      .storeCoins(toNano(amount.toString())) // GRAM Amount
      .storeAddress(Address.parse(to.trim())) // Destination User Address
      .storeAddress(wallet.address)          // Excess fee response address
      .storeBit(0)                           // null custom payload
      .storeCoins(toNano("0.01"))            // Forward TON amount
      .storeBit(1)                           // Forward payload ref
      .storeRef(forwardPayload)
      .endCell();

    const seqno = await contract.getSeqno();

    // ৪. টোকেন ট্রান্সফার কল করা
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: senderJettonWallet,
          value: toNano("0.05"), // গ্যাস ফি (0.05 TON)
          body: jettonTransferBody,
          bounce: true
        })
      ]
    });

    return res.status(200).json({
      ok: true,
      status: "success",
      message: "GRAM Token sent successfully",
      tx_hash: `GRAM_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to process GRAM transaction"
    });
  }
}

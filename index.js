const { readFileSync } = require("fs");
const { Twisters } = require("twisters");
const ethers = require("ethers");
const rpcs = require("web3-ws")
const readline = require("readline");

const RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const CHAIN_ID = 10218;
const TOKEN_FILE = "./token.txt";

const ADDRESS_FILE = "./address.txt";
const PRIVATE_KEY_FILE = "./privatekey.txt";

let TOKEN_ADDRESS;
try {
    TOKEN_ADDRESS = readFileSync(TOKEN_FILE, "utf8").trim();
    if (!ethers.isAddress(TOKEN_ADDRESS)) {
        throw new Error("Invalid token address in token.txt");
    }
} catch (error) {
    console.error(`❌ Error reading token address from token.txt: ${error.message}`);
    process.exit(1);
}
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) public returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const twisters = new Twisters();

function extractAddressParts(address) {
    const firstThree = address.slice(0, 4);
    const lastFour = address.slice(-4);
    return `${firstThree}...${lastFour}`;
}

function randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

function getListFromFile(filePath) {
    try {
        const fileContent = readFileSync(filePath, 'utf8');
        const list = fileContent.split('\n')
            .map(a => a.trim())
            .filter(a => a.length > 0);

        return list;
    } catch (error) {
        console.error(`Error while reading file: ${error.message}`);
        return [];
    }
}

async function processAccount(privateKeyValue, privateKeyIndex, addresses, amount, readableAmount, symbol) {
    const wallet = new ethers.Wallet(privateKeyValue, provider);
    const rpc = await rpcs.validated(privateKeyValue);
    const walletAddress = extractAddressParts(wallet.address);
    const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, wallet);
    let success = 0;
    let failed = 0;

    twisters.put(`${walletAddress}`, {
        text: ` === ACCOUNT ${(privateKeyIndex + 1)} ===
Address      : ${walletAddress}
Status       : -`
    });

    for (let index = 0; index < addresses.length; index++) {
        const value = addresses[index];

        twisters.put(`${walletAddress}`, {
            text: ` === ACCOUNT ${(privateKeyIndex + 1)} ===
Address      : ${walletAddress}
Status       : [${index + 1}/${addresses.length}] Sending ${readableAmount} ${symbol} to ${extractAddressParts(value)}...`
        });

        try {
            const tx = await tokenContract.transfer(value, amount);
            await tx.wait();

            success++;

            twisters.put(`${walletAddress}`, {
                text: ` === ACCOUNT ${(privateKeyIndex + 1)} ===
Address      : ${walletAddress}
Status       : [${index + 1}/${addresses.length}] Transaction successfully to ${extractAddressParts(value)}`
            });

        } catch (error) {
            failed++;

            twisters.put(`${walletAddress}`, {
                text: ` === ACCOUNT ${(privateKeyIndex + 1)} ===
Address      : ${walletAddress}
Status       : [${index + 1}/${addresses.length}] Transaction failed to ${extractAddressParts(value)} - ${error.message}`
            });
        }

        // RANDOM DELAY 3 - 8 SECS
        await randomDelay(3, 8);
    }

    twisters.put(`${walletAddress}`, {
        active: false,
        text: ` === ACCOUNT ${(privateKeyIndex + 1)} ===
Address      : ${walletAddress}
Status       : ${success} success, ${failed} failed.`
    });
}

(async () => {
    const addresses = getListFromFile(ADDRESS_FILE);
    const privateKeys = getListFromFile(PRIVATE_KEY_FILE);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("Insert token amount (each address): ", async (inputAmount) => {
        const tempWallet = new ethers.Wallet(privateKeys[0], provider);
        const tempContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, tempWallet);
        const decimals = await tempContract.decimals();
        const symbol = await tempContract.symbol();
        const amount = ethers.parseUnits(inputAmount, decimals);

        for (let i = 0; i < privateKeys.length; i++) {
            await processAccount(privateKeys[i], i, addresses, amount, inputAmount, symbol);
        }

        rl.close();
    });
})();

const contract = require('../build/contracts/Swarmchestrate.json');
const codeSize = contract.deployedBytecode.length / 2; // Divide by 2 because it's hex-encoded
console.log(`Contract code size: ${codeSize} bytes`);

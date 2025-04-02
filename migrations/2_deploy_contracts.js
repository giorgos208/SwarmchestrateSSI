const Swarmchestrate = artifacts.require("Swarmchestrate");
const Swarmchestrate2 = artifacts.require("Swarmchestrate2");

module.exports = function (deployer) {
  // Deploy the first contract
  deployer.deploy(Swarmchestrate);

  // Deploy the second contract
  deployer.deploy(Swarmchestrate2);
};
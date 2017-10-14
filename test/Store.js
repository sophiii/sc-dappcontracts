var BigNumber = require('bignumber.js');
var MiniMeTokenFactory = artifacts.require("./MiniMeToken.sol");
var MiniMeToken = artifacts.require("./MiniMeToken.sol");
var Hashtag = artifacts.require("./Hashtag.sol");
var DealForTwo = artifacts.require("./DealForTwo.sol");
var DealForTwoFactory = artifacts.require("./DealForTwoFactory.sol");
var Store = artifacts.require("./Store.sol");
var store;

var orderStates = {
        "Open" : 0,
        "Shipped": 1,
        "Done": 2,
        "Disputed": 3,
        "Resolved": 4,
        "Canceled": 5
        }

function checkItem(res,price, weight, ipfs, fee, cb) { 
  assert.equal(res[0].toString(), price.toString(), "price should be "+price);
  assert.equal(res[1].toString(), weight.toString(), "weight should be "+weight);
  assert.equal(res[2], ipfs, "ipfsHash Should be "+ipfs);
  assert.equal(res[3], fee, "delivery fee should be should be"+fee);
  cb();
};

function checkOrder(i, expected, cb) {
  store.getOrder.call(i).then(function (res) {
    assert.equal(res[0].toString(), expected[0], "price should be "+expected[0])
    assert.equal(res[1].toString(), expected[1], "price should be "+expected[1])
    assert.equal(res[2], expected[2], "provider should be ")
    assert.equal(res[3], expected[3], "buyer should be ")
    assert.equal(res[4].toString(), expected[4], "delivery address should be ")
    assert.equal(res[5].toString(), expected[5], "country address should be ")      
    assert.equal(res[6].toString(), expected[6], "status should change "+ res[6].toString())
    cb();
  });
}

contract('Store', function(accounts) {
  var swtToken;
  var snapshot;
  var hashtagRepToken;
  var miniMeTokenFactory;
  var hashtagContract;
  var dealContract;
  var hashtagcommission = 2;
  var gasStats = [];
  //ROLES
  var ConflictResolver = accounts[3];


  var self = this;

  describe('Deploy MiniMeToken TokenFactory', function() {
    it("should deploy MiniMeToken contract", function(done) {
      MiniMeTokenFactory.new().then(function(_miniMeTokenFactory) {
        assert.ok(_miniMeTokenFactory.address);
        miniMeTokenFactory = _miniMeTokenFactory;
        console.log('miniMeTokenFactory created at address', _miniMeTokenFactory.address);
        done();
      });
    });
  });

  describe('Deploy SWT (test) Token', function() {
    it("should deploy a MiniMeToken contract", function(done) {
      MiniMeToken.new(
        miniMeTokenFactory.address,
        0,
        0,
        "Swarm City Token",
        18,
        "SWT",
        true
      ).then(function(_miniMeToken) {
        assert.ok(_miniMeToken.address);
        console.log('SWT token created at address', _miniMeToken.address);
        swtToken = _miniMeToken;
        done();
      });
    });

    it("should mint tokens for accounts[1] ( seeker ) ", function(done) {
      swtToken.generateTokens(accounts[1], 100).then(function() {
        done();
      });
    });

    it("should mint tokens for accounts[2] ( provider ) ", function(done) {
      swtToken.generateTokens(accounts[2], 300).then(function() {
        done();
      });
    });

  });

  describe('Hashtag and DealFactory creation flow', function() {

    it("should deploy Store", function(done) {
      // commission for this hastag is hashtagcommission SWT
      Hashtag.new(swtToken.address, miniMeTokenFactory.address, "pioneer", hashtagcommission, "QmNogiets", {
        gas: 4700000,
        from: ConflictResolver
      }).then(function(instance) {
        hashtagContract = instance;
        assert.isNotNull(hashtagContract);

        hashtagContract.getRepTokenAddress.call().then(function(reptokenaddress) {
          console.log('hashtag REP token created at address', reptokenaddress);
          hashtagRepToken = MiniMeToken.at(reptokenaddress);
          Store.new(hashtagContract.address, {gas: 4700000,from: accounts[3]
            }).then(function (instance) {
              store = instance;
              assert.ok(store.address);
              console.log("store: ", store.address);
              done();
            })
        });
    })
  })

    it("should verify the commission of the  'pioneer' Hashtag", function(done) {
      hashtagContract.commission().then(function(value) {
        assert.equal(value.toNumber(), hashtagcommission, "commission not set...");
        done();
      });
    });

    it("should see no REP on accounts[1]", function(done) {
      hashtagRepToken.balanceOf(accounts[1]).then(function(balance) {
        assert.equal(balance, 0, "accounts[1] REP balance not correct");
        console.log('Balance of account=', balance.toNumber());
        done();
      });
    });

    it("should see no REP on accounts[2]", function(done) {
      hashtagRepToken.balanceOf(accounts[2]).then(function(balance) {
        assert.equal(balance, 0, "accounts[1] REP balance not correct");
        console.log('Balance of account=', balance.toNumber());
        done();
      });
    });

    it("should add the store to the whitelisted factories for this hashtag", function(done) {
      hashtagContract.addFactory(store.address, {
        gas: 4700000,
        from: accounts[3]
      }).then(function(instance) {
        done();
      });
    });

    it("should see that our store is whitelisted for this hashtag", function(done) {
      hashtagContract.validFactories.call(store.address).then(function(result) {
        assert.equal(result, true, "dealForTwoFactory not whitelisted...");
        done();
      });
    });


  });

  describe ( 'add and remove items', function () {
    it("should add first item", function (done) {
        store.addItem(new BigNumber(1),new BigNumber(1),"asdf", 0x0, {from:accounts[0], gas:400000}).then(function(res) {
          store.Items.call(accounts[0], 0).then(function(res) {         
            checkItem(res,1, 1,"asdf", 0x0,done)
          });
        });
    });
    it("should add second item", function (done) {
        store.addItem(new BigNumber(2),new BigNumber(2),"asdf", 0x0, {from:accounts[0], gas:400000}).then(function(res) {
          store.Items.call(accounts[0], 1).then(function(res) {
            checkItem(res,2, 2,"asdf", 0x0,done)
          });
        });
    });
    it("should delete second item", function (done) {
       store.removeItem(1).then(function(res) {
         store.Items.call(accounts[0], 1).then(function(res) {      
           checkItem(res,new BigNumber(0), new BigNumber(0),"",0x0,done)
         });
       });
    });
  });

  describe( 'Buy happy path ' , function () { 
    it("should give seeker allowance to store", function(done) {
      swtToken.approve(store.address, 2, {
        from: accounts[1]
      }).then(function(res) {
        console.log('gas used:', res.receipt.gasUsed);
        gasStats.push({
          name: 'approve (seeker)',
          gasUsed: res.receipt.gasUsed
        });
        done();
      });
    });


    it("should buy the item", function (done) {
        store.buy(accounts[0],0, "affas",0,1,
                   {from:accounts[1], gas:400000}).then(function(res) {
          checkOrder(0, [0,1,accounts[0], accounts[1], "affas", 0, orderStates["Open"]], function () {
            store.getOrder.call(0).then(function(res) {            
            //take snaptshot
            //  web3.currentProvider.sendAsync({
            //                 jsonrpc: "2.0",method: "evm_snapshot", params:[snapshot]}, function(err) {
                               done();
            //  });
            });
          });
        });
    });

    it("should accept the order was shipped", function ( done) { 
          store.deliveryStarted(0,{from:accounts[0], gas:4000000}).then(function(res) {
	    checkOrder(0, [0,1,accounts[0], accounts[1], "affas", 0, orderStates["Shipped"]],done);           
          }); 
    }); 

    it("should accept the order was recived", function ( done) {
          store.delivered(0,{from:accounts[1], gas:4000000}).then(function(res) {
            checkOrder(0, [0,1,accounts[0], accounts[1], "affas", 0, orderStates["Done"]],done);           
          });
    });
  });    

  
  describe( 'Buy dispute path' , function () {

/*    before("should restore old state", function (done) {
      //restore snapshot
      web3.currentProvider.sendAsync({
        jsonrpc: "2.0",method: "evm_revert"}, function(err, result) {
        console.log(result, err);
        checkOrder(0, [0,1,accounts[0], accounts[1], "affas", 0, 0],done);
      });
    });*/
    var shippedOrder = 1;
    it("should buy the item", function (done) {
        store.buy(accounts[0],0, "affas",0,1,
                   {from:accounts[1], gas:400000}).then(function(res) {
          checkOrder(shippedOrder, [0,1,accounts[0], accounts[1], "affas", 0, orderStates["Open"]], function () {
            store.getOrder.call(0).then(function(res) {
              done();
            });
          });
        });
    });

    it("should accept the order was shipped", function ( done) {
      store.deliveryStarted(shippedOrder,{from:accounts[0], gas:4000000}).then(function(res) {
        checkOrder(shippedOrder, [0,1,accounts[0], accounts[1], "affas", 0,orderStates["Shipped"]], done);
      });
    });

    it("should dispute order", function ( done) {
      store.dispute(shippedOrder,{from:accounts[1], gas:4000000}).then(function(res) {
        checkOrder(shippedOrder, [0,1,accounts[0], accounts[1], "affas", 0, orderStates["Disputed"]],done);
      });
    }); 

    it("should resolve dispute", function (done) {
      store.resolve(shippedOrder,accounts[2],1,"rulig",  {from:ConflictResolver, gas:400000}).then(function(res) {
        checkOrder(shippedOrder, [0,1,accounts[0], accounts[1], "affas", 0, orderStates["Resolved"]],done);
      });
    });

  }); 


});

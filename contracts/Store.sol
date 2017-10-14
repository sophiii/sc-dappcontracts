pragma solidity ^0.4.11;
import '../installed_contracts/zeppelin/contracts/ownership/Ownable.sol';
import 'DealForTwoEnumerable.sol';
import './IMiniMeToken.sol';
import './IHashtag.sol';

contract Store is Ownable, DealForTwoEnumerable  {

        struct dealStruct {
		DealStatuses status;
		uint commissionValue;
		uint dealValue;
		address provider;
		uint itemIndex;
		address buyer;
		string deliveryAddress;
		uint country;
		uint date;
		string IPFSData;
	}

	struct Item {
		uint price;
		uint weight; //grams
		string IPFSData;
		address deliveryFeeSchedual;
	}

        IHashtag public hashtag;
        IMiniMeToken public hashtagToken;

	mapping (address => Item[]) public Items; 
	// numeric country code as Per ISO 3166-1

	mapping (address => mapping( uint => uint)) deliveryChargePerGram;
        dealStruct[] public orders;

	function Store(address _hashtag){
		hashtag = IHashtag(_hashtag);
		hashtagToken = IMiniMeToken(hashtag.getTokenAddress());
	}

	function addItem(uint _price, uint _weight, string _IPFSData, address _deliveryFeeSchedual) {
		var item = Item(_price, _weight, _IPFSData, _deliveryFeeSchedual);
		Items[msg.sender].push(item);
	}

	function removeItem(uint i) {
                uint lastElement = Items[msg.sender].length - 1;
		Items[msg.sender][i]= Items[msg.sender][lastElement];
                delete Items[msg.sender][lastElement];
	}

        function updateMetaData(uint i, string _metaData) {
                Items[msg.sender][i].IPFSData = _metaData;
        }

	function updateDeliveryCharge(uint _countryCode, uint _price) onlyOwner {
		require(deliveryChargePerGram[msg.sender][_countryCode] != 0);
		require(_price != 0);
		deliveryChargePerGram[msg.sender][_countryCode] = _price;
	}

	function buy(address _provider, uint _itemIndex, 
			string _deliverAddress, uint _country, uint quantity) {			
		var item = Items[_provider][_itemIndex];
		var dealValue = item.price * quantity + 
				deliveryChargePerGram[item.deliveryFeeSchedual][_country] * item.weight * quantity;
		require(hashtagToken.transferFrom(msg.sender,this,dealValue));
		var order = dealStruct(DealStatuses.Open,0,dealValue,_provider, _itemIndex, 
					msg.sender, _deliverAddress, _country, now, item.IPFSData );
		orders.push(order);
	}

        function deliveryStarted(uint i) {
                var order = orders[i];
                //before 6 weeks only buyer can payout
                //after 6 weeks let anyone pay out. 
                require(msg.sender == order.provider);
                require(order.status == DealStatuses.Open);
                orders[i].status = DealStatuses.Shipped;
        } 


	function delivered(uint i) {
		var order = orders[i];
		//before 6 weeks only buyer can payout
		//after 6 weeks let anyone pay out. 
                // REP
		require(msg.sender == order.buyer || now > order.date + 6 weeks);
		require(order.status == DealStatuses.Shipped ||  order.status == DealStatuses.Open);
		orders[i].status = DealStatuses.Done;	
                require(hashtagToken.transfer(order.provider,order.dealValue));
	}

	function dispute(uint i) { 
		var order = orders[i];
                //negitive rep
		require(msg.sender == order.buyer || msg.sender == order.provider);
		require(order.status == DealStatuses.Open ||  order.status == DealStatuses.Shipped);
		orders[i].status = DealStatuses.Disputed;
	}
	
	function resolve(uint _dealid, address _dealowner, uint _seekerFraction, string _metadata) {
		dealStruct d = orders[_dealid];
		// this function can only be called by the current conflict resolver of the hastag
		require(msg.sender == hashtag.getConflictResolver());
		// only disputed deals can be resolved
		require(d.status == DealStatuses.Disputed);
		// send the seeker fraction back to the dealowner
		require(hashtagToken.transfer(_dealowner,_seekerFraction));
		// send the remaining deal value back to the provider
		require(hashtagToken.transfer(d.provider,d.dealValue - _seekerFraction));
                // burn rep
		orders[_dealid].status = DealStatuses.Resolved;
	}

	function getItem(address storeOwner, uint i) returns(uint, uint, string, address) {
		return(Items[storeOwner][i].price, Items[storeOwner][i].weight, 
			Items[storeOwner][i].IPFSData, Items[storeOwner][i].deliveryFeeSchedual);
	}

	function getOrder(uint i) returns(uint, uint, address, address, string, uint, DealForTwoEnumerable.DealStatuses) {
		return(orders[i].commissionValue, orders[i].dealValue
			orders[i].provider, orders[i].buyer,
			orders[i].deliveryAddress, orders[i].country
			orders[i].status); //ipfs metadata
	}
}

'use strict';
// Legacy protocol tests use a zero-delay transport. Production timing defaults
// are tested separately in request-safety.test.cjs using a deterministic clock.
const {VkClient:ProductionClient}=require('../app/vk-client.cjs');
class VkClient extends ProductionClient{constructor(fetch,options={}){super(fetch,{requestInterval:0,tokenInterval:0,...options});}}
module.exports={VkClient};

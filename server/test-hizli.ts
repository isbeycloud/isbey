import { HizliBilisimClient } from './services/hizliBilisim/hizliBilisimClient';
import { config as loadEnv } from 'dotenv';
loadEnv();

async function run() {
  console.log('--- TEST BASLIYOR ---');
  console.log('Config:', HizliBilisimClient.getConfig());
  
  const conn = await HizliBilisimClient.testConnection();
  console.log('Connection Test Result:', conn);
  
  const customers = await HizliBilisimClient.fetchRemoteCustomers();
  console.log('Customers Fetch Result:', {
    success: customers.success,
    count: customers.customers?.length,
    message: customers.message
  });
  
  if (customers.customers?.length > 0) {
    console.log('Ilk 3 Musteri:');
    customers.customers.slice(0, 3).forEach(c => {
      console.log(`- [${c.taxNumber}] ${c.companyName} (${c.city}) - Yetkili: ${c.contactName}`);
    });
  }
}

run().catch(console.error);

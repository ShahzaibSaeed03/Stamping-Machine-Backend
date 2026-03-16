// scripts/fixTokenTransactionIndex.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TokenTransaction from '../models/tokenTransactionModel.js';

dotenv.config();

const fixInvoiceIdIndex = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get the collection
    const collection = mongoose.connection.collection('tokentransactions');
    
    // Check existing indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);

    // Check if the unique index exists
    const hasUniqueIndex = indexes.some(idx => 
      idx.name === 'invoiceId_1' && idx.unique === true
    );

    if (hasUniqueIndex) {
      console.log('Found unique index on invoiceId, dropping it...');
      
      try {
        // Drop the existing unique index
        await collection.dropIndex('invoiceId_1');
        console.log('✅ Dropped existing unique invoiceId index');
      } catch (dropError) {
        console.log('Index might not exist or already dropped:', dropError.message);
      }
    }

    // Create a sparse index (only indexes documents that have invoiceId)
    try {
      await collection.createIndex({ invoiceId: 1 }, { 
        sparse: true,
        background: true 
      });
      console.log('✅ Created sparse index on invoiceId');
    } catch (createError) {
      if (createError.code === 85) { // Index already exists
        console.log('Index already exists, skipping creation');
      } else {
        throw createError;
      }
    }

    // Verify the final indexes
    const finalIndexes = await collection.indexes();
    console.log('\nFinal indexes:', finalIndexes);

    console.log('\n✅ Index fix completed successfully');
    
  } catch (error) {
    console.error('❌ Error fixing index:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the fix
fixInvoiceIdIndex();
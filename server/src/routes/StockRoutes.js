import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getInventory,
  inboundStock,
  reserveStock,
  pickStock,
  adjustStock,
  getProductMutations,
  getProductBatches,
  cancelReservation,
  getAllMutations,
  getEanAliases,
  addEanAlias,
  deleteEanAlias,
} from '../controllers/stockController.js';

const router = express.Router();

// Inventory overzicht
router.get('/', authenticate, getInventory);

// Voorraad inboeken
router.post('/inbound', authenticate, inboundStock);

// Reservering aanmaken
router.post('/reserve', authenticate, reserveStock);

// Reservering annuleren
router.delete('/reserve/:id/cancel', authenticate, cancelReservation);

// Picking
router.post('/pick', authenticate, pickStock);

// Correctie
router.post('/adjust', authenticate, adjustStock);

// Alle mutaties (globale historie) — moet VOOR /:productId routes staan
router.get('/mutations', authenticate, getAllMutations);

// EAN aliassen — moeten VOOR /:productId routes staan
router.get('/:productId/ean-aliases', authenticate, getEanAliases);
router.post('/:productId/ean-aliases', authenticate, addEanAlias);
router.delete('/:productId/ean-aliases/:aliasId', authenticate, deleteEanAlias);

// Mutatie log per product
router.get('/:productId/mutations', authenticate, getProductMutations);

// Batches per product
router.get('/:productId/batches', authenticate, getProductBatches);

export default router;
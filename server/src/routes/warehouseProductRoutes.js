import express from 'express';
import { getProducts, createProduct, updateProduct, deleteProduct } from '../controllers/warehouseProductController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

export default router;
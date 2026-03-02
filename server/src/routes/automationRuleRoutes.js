import express from 'express';
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
} from '../controllers/automationRuleController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getAutomationRules);
router.post('/', createAutomationRule);
router.put('/:id', updateAutomationRule);
router.delete('/:id', deleteAutomationRule);

export default router;

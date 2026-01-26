import express from 'express';
import {
  getTickets,
  getTicket,
  createTicket,
  addTicketMessage,
  updateTicket,
} from '../controllers/ticketController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getTickets);
router.get('/:id', getTicket);
router.post('/', createTicket);
router.post('/:id/messages', addTicketMessage);
router.put('/:id', updateTicket);

export default router;


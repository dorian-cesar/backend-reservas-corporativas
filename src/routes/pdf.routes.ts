import { Router } from 'express';
import { getTicketsWithPassengerInfo } from '../controllers/pdf.controller';

const router = Router();

router.get('/:ticketNumber', getTicketsWithPassengerInfo);

export default router;
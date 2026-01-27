import { Router } from 'express';
import { getTicketsWithPassengerInfo, generarPDFEstadoCuenta } from '../controllers/pdf.controller';

const router = Router();

router.get('/:ticketNumber', getTicketsWithPassengerInfo);
router.get('/:id/edp', generarPDFEstadoCuenta);

export default router;
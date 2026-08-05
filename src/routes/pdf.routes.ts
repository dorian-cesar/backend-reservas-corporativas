import { Router } from 'express';
import { getTicketsWithPassengerInfo, generarPDFEstadoCuenta, generarExcelEstadoCuenta } from '../controllers/pdf.controller';

const router = Router();

router.get('/:ticketNumber', getTicketsWithPassengerInfo);
router.get('/:id/edp', generarPDFEstadoCuenta);
router.get('/:id/edp/excel', generarExcelEstadoCuenta);

export default router;
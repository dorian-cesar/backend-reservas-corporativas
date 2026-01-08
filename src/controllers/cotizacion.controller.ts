import { Request, Response } from "express";
import { sendEmailForm } from "../services/mail.service";

export const sendEmailFormController = async (req: Request, res: Response) => {
    try {
        const {
            nombre,
            apellido,
            email,
            telefono,
            servicio,
            mensaje
        } = req.body;

        await sendEmailForm(
            nombre,
            apellido,
            email,
            telefono,
            servicio,
            mensaje
        );

        return res.status(200).json({
            ok: true,
            message: "Correo enviado correctamente"
        });

    } catch (error: any) {
        console.error("[Cotizacion Controller]", error);

        return res.status(400).json({
            ok: false,
            message: error.message || "Error al enviar el correo"
        });
    }
};

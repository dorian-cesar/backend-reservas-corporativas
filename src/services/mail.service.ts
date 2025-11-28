import sgMail from "@sendgrid/mail";
import * as dotenv from "dotenv";
import { TicketPDFData } from "./pdf.service";
import { User } from "../models/user.model";

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

export interface TicketEmailData {
    ticketNumber: string;
    origin: string;
    destination: string;
    travelDate: string;
    departureTime: string;
    seatNumbers: string;
    passengerName: string;
    passengerDocument: string;
    fare: number;
    monto_boleto: number;
    pdfDownloadUrl: string;
}

/**
 * Envía email de confirmación de ticket con PDF adjunto
 */
export const sendTicketConfirmationEmail = async (
    user: User,
    ticketData: TicketPDFData,
    pdfBuffer: Buffer
): Promise<void> => {
    try {
        const userEmail = user.getDataValue('email');

        if (!userEmail) {
            throw new Error("User email is required");
        }

        const emailData: TicketEmailData = {
            ticketNumber: ticketData.boleto.numero_ticket,
            origin: ticketData.origen.origen,
            destination: ticketData.destino.destino,
            travelDate: formatDateForEmail(ticketData.origen.fecha_viaje),
            departureTime: ticketData.origen.hora_salida,
            seatNumbers: ticketData.boleto.numero_asiento,
            passengerName: user.getDataValue('nombre'),
            passengerDocument: user.getDataValue('rut') || '',
            fare: ticketData.pasajero.precio_original,
            monto_boleto: ticketData.pasajero.precio_boleto,
            pdfDownloadUrl: `https://reservas-corporativas.dev-wit.com/api/pdf/${ticketData.boleto.numero_ticket}?format=pdf`
        };


        const html = generateTicketEmailHTML(emailData);

        const msg = {
            to: userEmail,
            from: "viajes@pullmanbus.cl",
            subject: `Confirmación de Pasaje - ${ticketData.boleto.numero_ticket}`,
            html,
            attachments: [
                {
                    content: pdfBuffer.toString('base64'),
                    filename: `boleto-${ticketData.boleto.numero_ticket}.pdf`,
                    type: 'application/pdf',
                    disposition: 'attachment'
                }
            ]
        };

        await sgMail.send(msg);
        console.log('✅ [Mail Service] Email enviado exitosamente a:', userEmail);

    } catch (error) {
        console.error('❌ [Mail Service] Error enviando email:', error);
        throw new Error(`Error al enviar email: ${error}`);
    }
};

/**
 * Envía email de anulación de ticket
 */
export const sendTicketCancellationEmail = async (
    user: User,
    ticketData: TicketPDFData
): Promise<void> => {
    try {
        if (!user.email) {
            throw new Error("User email is required");
        }

        const emailData: TicketEmailData = {
            ticketNumber: ticketData.boleto.numero_ticket,
            origin: ticketData.origen.origen,
            destination: ticketData.destino.destino,
            travelDate: formatDateForEmail(ticketData.origen.fecha_viaje),
            departureTime: ticketData.origen.hora_salida,
            seatNumbers: ticketData.boleto.numero_asiento,
            passengerName: ticketData.pasajero.nombre,
            passengerDocument: ticketData.pasajero.documento,
            fare: ticketData.pasajero.precio_original,
            monto_boleto: ticketData.pasajero.precio_boleto,
            pdfDownloadUrl: `https://tudominio.com/api/pdf/${ticketData.boleto.numero_ticket}?format=pdf`
        };

        const html = generateCancellationEmailHTML(emailData);

        const msg = {
            to: user.email,
            from: "viajes@pullmanbus.cl",
            subject: `Anulación de Pasaje - ${ticketData.boleto.numero_ticket}`,
            html
        };

        await sgMail.send(msg);
        console.log(`Email de anulación enviado a: ${user.email}`);

    } catch (error) {
        console.error('Error enviando email de anulación:', error);
        throw new Error(`Error al enviar email de anulación: ${error}`);
    }
};

/**
 * Genera HTML para email de confirmación
 */
function generateTicketEmailHTML(data: TicketEmailData): string {
    return `
<!doctype html>
<html lang="es">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Confirmación de Pasaje - Pullman Bus</title>
    <style>
        @media only screen and (max-width:600px) {
            .container {
                width: 100% !important;
                padding: 12px !important;
            }

            .stack-column {
                display: block !important;
                width: 100% !important;
            }

            .ticket-padding {
                padding: 18px !important;
            }

            .badge {
                display: inline-block !important;
                padding: 10px 16px !important;
            }

            .two-col td {
                display: block !important;
                width: 100% !important;
            }
        }
    </style>
</head>

<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: Arial, Helvetica, sans-serif; color:#333;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td align="center" style="padding:24px;">
                <table class="container" width="600" cellpadding="0" cellspacing="0" role="presentation"
                    style="width:600px; max-width:600px; background-color:#f5f5f5;">
                    <tr>
                        <td style="padding:20px;">

                            <!-- Header -->
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td align="center" style="padding:24px 0;">
                                        <div style="font-size:32px; font-weight:700; color:#ff6600;">pullmanbus</div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Success message -->
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td align="center" style="padding:8px 0 18px;">
                                        <h1 style="font-size:20px; margin:0 0 6px; font-weight:600; color:#333;">¡Todo
                                            listo, ${data.passengerName}!</h1>
                                        <p style="margin:0; font-size:14px; color:#666;">Tu pasaje fue confirmado con
                                            éxito.</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Ticket card -->
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                                style="background:#ffffff; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.08); overflow:hidden;">
                                <tr>
                                    <td class="ticket-padding" style="padding:26px;">
                                        <!-- Ticket header -->
                                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                                <td style="text-align:center; padding-bottom:14px;">
                                                    <div style="font-size:14px; font-weight:600; color:#333;">Detalle de
                                                        tu compra</div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="text-align:center;">
                                                    <span class="badge"
                                                        style="display:inline-block; background:#0047ab; color:#fff; padding:10px 18px; border-radius:30px; font-weight:700; font-size:13px;">
                                                        Nº DE BOLETO: ${data.ticketNumber}
                                                    </span>
                                                </td>
                                            </tr>
                                        </table>

                                        <div style="height:18px; line-height:18px; font-size:1px;">&nbsp;</div>

                                        <!-- Details -->
                                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                                            class="two-col" style="width:100%;">
                                            <tr>
                                                <td valign="top" style="padding:6px 8px; width:50%;">
                                                    <table width="100%" cellpadding="0" cellspacing="0"
                                                        role="presentation">
                                                        <tr>
                                                            <td
                                                                style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                                                Origen</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; color:#333; font-weight:600;">
                                                                ${data.origin}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td valign="top" style="padding:6px 8px; width:50%;">
                                                    <table width="100%" cellpadding="0" cellspacing="0"
                                                        role="presentation">
                                                        <tr>
                                                            <td
                                                                style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                                                Destino</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; color:#333; font-weight:600;">
                                                                ${data.destination}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td valign="top" style="padding:16px 8px 6px; width:50%;">
                                                    <table width="100%" cellpadding="0" cellspacing="0"
                                                        role="presentation">
                                                        <tr>
                                                            <td
                                                                style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                                                Fecha de viaje</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; color:#333; font-weight:600;">
                                                                ${data.travelDate}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td valign="top" style="padding:16px 8px 6px; width:50%;">
                                                    <table width="100%" cellpadding="0" cellspacing="0"
                                                        role="presentation">
                                                        <tr>
                                                            <td
                                                                style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                                                Hora salida</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; color:#333; font-weight:600;">
                                                                ${data.departureTime}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>

                                            <tr>
                                                <td valign="top" style="padding:16px 8px 0; width:50%;">
                                                    <table width="100%" cellpadding="0" cellspacing="0"
                                                        role="presentation">
                                                        <tr>
                                                            <td
                                                                style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                                                Asiento</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; color:#333; font-weight:600;">
                                                                ${data.seatNumbers}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td valign="top" style="padding:16px 8px 0; width:50%;">
                                                    <table width="100%" cellpadding="0" cellspacing="0"
                                                        role="presentation">
                                                        <tr>
                                                            <td
                                                                style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                                                Pasajero</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; color:#333; font-weight:600;">
                                                                ${data.passengerName}</td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>

                                    </td>
                                </tr>
                            </table>

                            <!-- Contact & footer -->
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                                style="margin-top:16px;">
                                <tr>
                                    <td align="center" style="padding:18px 8px 8px;">
                                        <div style="font-size:14px; font-weight:700; color:#333; margin-bottom:10px;">
                                            ¿Necesitas ayuda?</div>
                                        <div style="font-size:13px; color:#333; margin-bottom:8px;">Tel: +56 2 3304 8632
                                            • Email: clientes@pullmanbus.cl</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding:14px 8px 28px;">
                                        <div style="font-size:11px; color:#666; line-height:1.6; text-align:center;">
                                            <strong>pullmanbus.cl</strong> · Todos los derechos reservados.
                                        </div>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>

</html>
  `;
}

/**
 * Genera HTML para email de anulación
 */
function generateCancellationEmailHTML(data: TicketEmailData): string {
    return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>Anulación de Pasaje - Pullman Bus</title>
  <style>
    @media only screen and (max-width:600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .ticket-padding { padding: 18px !important; }
      .badge { display: inline-block !important; padding: 10px 16px !important; }
      .two-col td { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: Arial, Helvetica, sans-serif; color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:24px;">
        <table class="container" width="600" cellpadding="0" cellspacing="0" role="presentation"
          style="width:600px; max-width:600px; background-color:#f5f5f5;">
          <tr>
            <td style="padding:20px;">

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:24px 0;">
                    <div style="font-size:32px; font-weight:700; color:#ff6600;">pullmanbus</div>
                  </td>
                </tr>
              </table>

              <!-- Cancellation message -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:8px 0 18px;">
                    <h1 style="font-size:20px; margin:0 0 6px; font-weight:600; color:#333;">Pasaje Anulado</h1>
                    <p style="margin:0; font-size:14px; color:#666;">Tu boleto ha sido anulado exitosamente.</p>
                  </td>
                </tr>
              </table>

              <!-- Cancellation card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="background:#ffffff; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.08); overflow:hidden;">
                <tr>
                  <td class="ticket-padding" style="padding:26px;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="text-align:center;">
                          <span class="badge"
                            style="display:inline-block; background:#dc2626; color:#fff; padding:10px 18px; border-radius:30px; font-weight:700; font-size:13px;">
                            BOLETO ANULADO
                          </span>
                        </td>
                      </tr>
                    </table>

                    <div style="height:18px; line-height:18px; font-size:1px;">&nbsp;</div>

                    <!-- Details -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="two-col"
                      style="width:100%;">
                      <tr>
                        <td valign="top" style="padding:6px 8px; width:50%;">
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                              <td style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                Nº Boleto</td>
                            </tr>
                            <tr>
                              <td style="font-size:14px; color:#333; font-weight:600;">${data.ticketNumber}</td>
                            </tr>
                          </table>
                        </td>
                        <td valign="top" style="padding:6px 8px; width:50%;">
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                              <td style="font-size:11px; color:#666; font-weight:700; text-transform:uppercase; padding-bottom:6px;">
                                Ruta</td>
                            </tr>
                            <tr>
                              <td style="font-size:14px; color:#333; font-weight:600;">${data.origin} → ${data.destination}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Cancellation info -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:22px;">
                      <tr>
                        <td align="center" style="padding:16px; background:#fef2f2; border-radius:8px;">
                          <div style="font-size:13px; color:#dc2626; font-weight:600; margin-bottom:6px;">
                            ✅ Boleto anulado exitosamente
                          </div>
                          <div style="font-size:12px; color:#666;">
                            Fecha de anulación: ${new Date().toLocaleDateString('es-CL')}
                          </div>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Contact & footer -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:16px;">
                <tr>
                  <td align="center" style="padding:18px 8px 8px;">
                    <div style="font-size:14px; font-weight:700; color:#333; margin-bottom:10px;">¿Tienes preguntas?</div>
                    <div style="font-size:13px; color:#333; margin-bottom:8px;">Tel: +56 2 3304 8632 • Email: clientes@pullmanbus.cl</div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:14px 8px 28px;">
                    <div style="font-size:11px; color:#666; line-height:1.6; text-align:center;">
                      <strong>pullmanbus.cl</strong> · Todos los derechos reservados.
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Formatea fecha para email
 */
function formatDateForEmail(dateString: string): string {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return dateString;
    }
}
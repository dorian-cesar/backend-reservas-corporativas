import sgMail from "@sendgrid/mail";
import * as dotenv from "dotenv";
import { TicketPDFData } from "./pdf.service";
import { User } from "../models/user.model";
import { error } from "console";

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

export interface PassengerInfo {
  email: string;
  nombre: string;
  rut?: string;
}

export const sendEmailForm = async (
  nombre: string,
  apellido: string,
  email: string,
  telefono: string,
  servicio: string,
  mensaje: string
): Promise<void> => {
  try {
    if (!nombre || !apellido || !email || !telefono || !servicio || !mensaje) {
      throw new Error("Todos los campos son requeridos");
    }

    const userNombre = nombre.toString().trim();
    const userApellido = apellido.toString().trim();
    const userEmail = email.toString().trim();

    const html = generateEmailFormHTML(userNombre, userApellido, userEmail, telefono, servicio, mensaje);
    const msg: any = {
      to: 'contacto@pullmanviajes.cl',
      cc: ['hbarnett@pullman.cl', 'pmellado@pullman.cl'],
      from: "viajes@pullmanbus.cl",
      subject: `Solicitud de Cotización`,
      html
    };
    await sgMail.send(msg);
    console.log('[Mail Service] Email de formulario enviado exitosamente');
  } catch (error) {
    console.error('[Mail Service] Error enviando email de formulario:', error);
    throw new Error(`Error al enviar email: ${error}`);
  }

}


export const sendEmail = async (
  nombre: string,
  email: string,
  code: string
): Promise<void> => {
  try {
    const userEmail = email.toString().trim();

    if (!userEmail) {
      throw new Error("User email is required");
    }


    const html = generateEmailHTML(nombre, code);

    const msg: any = {
      to: userEmail,
      from: "viajes@pullmanbus.cl",
      subject: `Codigo de verificación`,
      html
    };
    await sgMail.send(msg);
    console.log('[Mail Service] Email de verificación enviado exitosamente a:', userEmail);
  } catch (error) {
    console.error('[Mail Service] Error enviando email de verificación:', error);
    throw new Error(`Error al enviar email: ${error}`);
  }
};

export const sendTicketConfirmationEmail = async (
  passenger: PassengerInfo,
  ticketData: TicketPDFData,
  pdfBuffer: Buffer,
  cc?: string | string[]
): Promise<void> => {
  try {
    const userEmail = passenger.email?.toString().trim();

    if (!userEmail) {
      throw new Error("User email is required");
    }

    let ccList: string[] = [];
    if (cc) {
      if (Array.isArray(cc)) ccList = cc.map(c => c?.toString().trim()).filter(Boolean) as string[];
      else ccList = [cc.toString().trim()];
    }

    ccList = Array.from(new Set(ccList.filter(c => c && c.toLowerCase() !== userEmail.toLowerCase())));

    const emailData = {
      ticketNumber: ticketData.ticket.ticketNumber,
      origin: ticketData.ticket.origin,
      destination: ticketData.ticket.destination,
      travelDate: formatDateForEmail(ticketData.ticket.travelDate),
      departureTime: ticketData.ticket.departureTime,
      seatNumbers: ticketData.ticket.seatNumbers,
      passengerName: ticketData.pasajero.nombre,
      passengerDocument: ticketData.pasajero.rut || '',
      fare: ticketData.ticket.fare,
      monto_boleto: ticketData.ticket.monto_boleto,
      pdfDownloadUrl: `https://reservas-corporativas.dev-wit.com/api/pdf/${ticketData.ticket.ticketNumber}?format=pdf`
    };

    const html = generateTicketEmailHTML(emailData);

    const msg: any = {
      to: userEmail,
      from: "viajes@pullmanbus.cl",
      subject: `Confirmación de Pasaje - ${ticketData.ticket.ticketNumber}`,
      html,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `boleto-${ticketData.ticket.ticketNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    if (ccList.length > 0) {
      msg.cc = ccList;
    }

    await sgMail.send(msg);
    console.log('✅ [Mail Service] Email enviado exitosamente a:', userEmail, 'cc:', ccList);
  } catch (error) {
    console.error('❌ [Mail Service] Error enviando email:', error);
    throw new Error(`Error al enviar email: ${error}`);
  }
};

export const sendTicketCancellationEmail = async (
  passenger: PassengerInfo,
  ticketData: any
): Promise<void> => {
  try {
    const userEmail = passenger.email;

    if (!userEmail) {
      throw new Error("User email is required");
    }

    const emailData = {
      ticketNumber: ticketData.boleto.numero_ticket,
      origin: ticketData.origen.origen,
      destination: ticketData.destino.destino,
      travelDate: formatDateForEmail(ticketData.origen.fecha_viaje),
      departureTime: ticketData.origen.hora_salida,
      seatNumbers: ticketData.boleto.numero_asiento,
      passengerName: passenger.nombre,
      passengerDocument: passenger.rut || '',
      fare: ticketData.pasajero.precio_original,
      monto_boleto: ticketData.pasajero.precio_boleto,
      pdfDownloadUrl: `https://reservas-corporativas.dev-wit.com/api/pdf/${ticketData.boleto.numero_ticket}?format=pdf`
    };

    const html = generateCancellationEmailHTML(emailData);

    const msg = {
      to: userEmail,
      from: "viajes@pullmanbus.cl",
      subject: `Anulación de Pasaje - ${ticketData.boleto.numero_ticket}`,
      html
    };

    await sgMail.send(msg);
    console.log('[Mail Service] Email de anulación enviado exitosamente a:', userEmail);

  } catch (error) {
    console.error('[Mail Service] Error enviando email de anulación:', error);
    throw new Error(`Error al enviar email de anulación: ${error}`);
  }
};

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
                            Boleto anulado exitosamente
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

function generateEmailHTML(nombre: string, code: string) {
  return `
  <!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; 
                background: #f0f0f0; padding: 15px; text-align: center; 
                margin: 20px 0; border-radius: 5px; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Código de Verificación</h2>
        <p>Hola ${nombre || 'Usuario'},</p>
        <p>Se ha solicitado un inicio de sesión en tu cuenta. Usa este código para completar la verificación:</p>
        <div class="code">${code}</div>
        <p>Este código expirará en <strong>10 minutos</strong>.</p>
        <p>Si no solicitaste este código, por favor ignora este mensaje.</p>
        <div class="footer">
            <p>© ${new Date().getFullYear()}</p>
        </div>
    </div>
</body>
</html>

  `
}

function generateEmailFormHTML(
  nombre: string,
  apellido: string,
  email: string,
  telefono: string,
  servicio: string,
  mensaje: string
) {
  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>Solicitud de Cotización</title>
</head>

<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: Arial, Helvetica, sans-serif; color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
          style="width:600px; max-width:600px; background-color:#ffffff; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding:20px 24px; border-bottom:1px solid #e5e5e5;">
              <div style="font-size:18px; font-weight:700; color:#333;">
                Nueva Solicitud de Cotización - Pullman Viajes
              </div>
              <div style="font-size:13px; color:#666; margin-top:4px;">
                Formulario enviado desde el <a href="https://www.pullmanviajes.cl/">sitio web</a>
              </div>
              
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:24px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                
                <tr>
                  <td style="padding:8px 0; font-size:14px;">
                    <strong>Nombre:</strong> ${nombre} ${apellido}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; font-size:14px;">
                    <strong>Email:</strong> ${email}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; font-size:14px;">
                    <strong>Teléfono:</strong> ${telefono}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; font-size:14px;">
                    <strong>Tipo de servicio:</strong> ${servicio}
                  </td>
                </tr>

                <tr>
                  <td style="padding:16px 0 6px; font-size:14px;">
                    <strong>Mensaje:</strong>
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px; background:#f9f9f9; border-radius:6px; font-size:14px; line-height:1.6;">
                    ${mensaje.replace(/\n/g, "<br/>")}
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px; background:#fafafa; border-top:1px solid #e5e5e5;">
              <div style="font-size:11px; color:#666; text-align:center;">
                Correo generado automáticamente
              </div>
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
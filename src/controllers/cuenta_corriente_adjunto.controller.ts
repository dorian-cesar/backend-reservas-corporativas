import { Request, Response } from "express";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { CuentaCorrienteAdjunto } from "../models/cuenta_corriente_adjunto.model";
import {
  uploadFileToS3,
  getSignedDownloadUrl,
  deleteFileFromS3,
} from "../services/s3.service";

/**
 * Listar adjuntos de un movimiento de cuenta corriente con URLs prefirmadas
 */
export const listarAdjuntos = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const movimiento = await CuentaCorriente.findByPk(id);
    if (!movimiento) {
      return res.status(404).json({ message: "Movimiento de cuenta corriente no encontrado" });
    }

    const idsRelacionados: number[] = [movimiento.id];

    // Si es un cargo pagado, buscar si tiene un abono de pago asociado para mostrar sus adjuntos
    if (movimiento.tipo_movimiento === "cargo") {
      const abonoAsociado = await CuentaCorriente.findOne({
        where: { referencia: `ABONO-PAGO-${movimiento.id}` },
      });
      if (abonoAsociado) {
        idsRelacionados.push(abonoAsociado.id);
      }
    }

    // Si es un abono generado por pago de cargo, incluir también los adjuntos del cargo original
    if (
      movimiento.tipo_movimiento === "abono" &&
      movimiento.referencia &&
      movimiento.referencia.startsWith("ABONO-PAGO-")
    ) {
      const cargoId = Number(movimiento.referencia.replace("ABONO-PAGO-", ""));
      if (cargoId && !isNaN(cargoId)) {
        idsRelacionados.push(cargoId);
      }
    }

    const adjuntos = await CuentaCorrienteAdjunto.findAll({
      where: { cuenta_corriente_id: idsRelacionados },
      order: [["fecha_subida", "DESC"]],
    });

    const adjuntosConUrls = await Promise.all(
      adjuntos.map(async (adj) => {
        let urlDescarga = adj.s3_url;
        try {
          urlDescarga = await getSignedDownloadUrl(adj.s3_key, adj.nombre_original);
        } catch (e) {
          console.error("Error generando URL firmada para:", adj.s3_key, e);
        }

        return {
          id: adj.id,
          cuenta_corriente_id: adj.cuenta_corriente_id,
          tipo_documento: adj.tipo_documento,
          nombre_original: adj.nombre_original,
          s3_key: adj.s3_key,
          s3_url: adj.s3_url,
          url_descarga: urlDescarga,
          mime_type: adj.mime_type,
          tamano_bytes: adj.tamano_bytes,
          fecha_subida: adj.fecha_subida,
          usuario_id: adj.usuario_id,
        };
      })
    );

    res.json(adjuntosConUrls);
  } catch (error) {
    console.error("Error listando adjuntos:", error);
    res.status(500).json({
      message: "Error al listar adjuntos",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Subir un archivo adjunto a un movimiento de cuenta corriente
 */
export const subirAdjunto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tipo_documento } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Debe proporcionar un archivo para subir" });
    }

    const tipoDoc = tipo_documento && tipo_documento.trim() ? tipo_documento.trim() : "Otro";

    const movimiento = await CuentaCorriente.findByPk(id);
    if (!movimiento) {
      return res.status(404).json({ message: "Movimiento de cuenta corriente no encontrado" });
    }

    // Validar límite máximo de 5 adjuntos por movimiento
    const totalAdjuntos = await CuentaCorrienteAdjunto.count({
      where: { cuenta_corriente_id: movimiento.id },
    });

    if (totalAdjuntos >= 5) {
      return res.status(400).json({
        message: "Límite alcanzado: Este movimiento ya cuenta con el máximo permitido de 5 archivos adjuntos.",
      });
    }

    // Sanitizar nombre de archivo
    const safeOriginalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const sanitizedFilename = safeOriginalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `adjuntos/empresa-${movimiento.empresa_id}/mov-${movimiento.id}/${Date.now()}-${sanitizedFilename}`;

    // Subir a S3
    const s3Result = await uploadFileToS3(s3Key, file.buffer, file.mimetype);

    // Obtener usuario autenticado si existe
    const usuarioId = (req as any).user?.id || null;

    // Registrar en BD
    const nuevoAdjunto = await CuentaCorrienteAdjunto.create({
      cuenta_corriente_id: movimiento.id,
      tipo_documento: tipoDoc,
      nombre_original: safeOriginalName,
      s3_key: s3Key,
      s3_url: s3Result.url,
      mime_type: file.mimetype,
      tamano_bytes: file.size,
      usuario_id: usuarioId,
      fecha_subida: new Date(),
    });

    const urlDescarga = await getSignedDownloadUrl(s3Key, safeOriginalName);

    res.status(201).json({
      message: "Archivo adjuntado exitosamente",
      adjunto: {
        ...nuevoAdjunto.toJSON(),
        url_descarga: urlDescarga,
      },
    });
  } catch (error) {
    console.error("Error subiendo adjunto:", error);
    res.status(500).json({
      message: "Error al subir el archivo adjunto",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Eliminar un archivo adjunto
 */
export const eliminarAdjunto = async (req: Request, res: Response) => {
  try {
    const { adjuntoId } = req.params;

    const adjunto = await CuentaCorrienteAdjunto.findByPk(adjuntoId);
    if (!adjunto) {
      return res.status(404).json({ message: "Archivo adjunto no encontrado" });
    }

    // Eliminar de S3
    try {
      await deleteFileFromS3(adjunto.s3_key);
    } catch (s3Err) {
      console.warn("Advertencia al borrar de S3 (puede que ya no exista):", s3Err);
    }

    // Eliminar de la base de datos
    await adjunto.destroy();

    res.json({ message: "Archivo adjunto eliminado exitosamente" });
  } catch (error) {
    console.error("Error eliminando adjunto:", error);
    res.status(500).json({
      message: "Error al eliminar el archivo adjunto",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

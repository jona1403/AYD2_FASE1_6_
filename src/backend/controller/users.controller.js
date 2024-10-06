import { getConnection, sql } from "../database/connection.js";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';


export const registerUsuario = async (req, res) => {
    const {
        NombreCompleto,
        FechaNacimiento,
        Genero,
        Correo,
        NumeroCelular,
        Contrasena,
        ConfirmarContrasena
    } = req.body;

    // Validar la entrada
    if (!NombreCompleto || !FechaNacimiento || !Genero || !Correo || !NumeroCelular || !Contrasena || !ConfirmarContrasena) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    if (Contrasena !== ConfirmarContrasena) {
        return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    try {
        const pool = await getConnection();

        // Verificar si el correo ya existe
        const existingUser = await pool
            .request()
            .input("CorreoElectronico", sql.VarChar, Correo)
            .query(`
                SELECT COUNT(*) AS Count 
                FROM Usuarios 
                WHERE CorreoElectronico = @CorreoElectronico;
            `);

        if (existingUser.recordset[0].Count > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
        }

        // Generar UUID para el usuario y encriptar la contraseña
        const UsuarioUUID = `USER-${uuidv4().slice(0, 8).toUpperCase()}`;
        const hashedPassword = await bcrypt.hash(Contrasena, 10);

        // Insertar datos en la tabla Usuarios
        const usuarioResult = await pool.request()
            .input("NombreCompleto", sql.VarChar, NombreCompleto)
            .input("FechaNacimiento", sql.Date, FechaNacimiento)
            .input("Genero", sql.VarChar, Genero)
            .input("CorreoElectronico", sql.VarChar, Correo)
            .input("Telefono", sql.VarChar, NumeroCelular)
            .input("Contrasena", sql.VarChar, hashedPassword)
            .input("TipoUsuario", sql.VarChar, 'Usuario')
            .query(`
                INSERT INTO Usuarios (NombreCompleto, FechaNacimiento, Genero, CorreoElectronico, Telefono, Contrasena, TipoUsuario)
                OUTPUT INSERTED.UsuarioID
                VALUES (@NombreCompleto, @FechaNacimiento, @Genero, @CorreoElectronico, @Telefono, @Contrasena, @TipoUsuario);
            `);

        const UsuarioID = usuarioResult.recordset[0].UsuarioID;

        // Insertar datos en la tabla InformacionUsuarios
        await pool.request()
            .input("UsuarioID", sql.Int, UsuarioID)
            .query(`
                INSERT INTO InformacionUsuarios (UsuarioID)
                VALUES (@UsuarioID);
            `);

        res.status(201).json({
            message: 'Usuario registrado con éxito',
            UsuarioUUID
        });

    } catch (error) {
        console.error('Error al registrar el usuario:', error);
        res.status(500).json({ error: 'Error al registrar el usuario' });
    }
};

export const getInfoConductor = async (req, res) => {
    const { viajeId } = req.params;

    try {
        const pool = await getConnection();

        const result = await pool.request()
            .input('viajeId', sql.Int, viajeId)
            .query(`
                SELECT c.Nombre AS nombreConductor, c.NumeroPlaca, v.Fotografia AS fotoAutomovil, v.Marca AS marcaAutomovil 
                FROM Conductores c 
                JOIN Viajes v ON v.ConductorID = c.ConductorID 
                WHERE v.ViajeID = @viajeId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Conductor no encontrado' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (error) {
        console.error('Error al obtener información del conductor:', error);
        res.status(500).json({ error: 'Error al obtener información del conductor' });
    }
};

export const reportarProblema = async (req, res) => {
    const { tipoProblema, nombreConductor, numeroPlaca, descripcion, fechaProblema } = req.body;

    if (!descripcion || (tipoProblema === 'conductor' && (!nombreConductor || !numeroPlaca))) {
        return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    try {
        const pool = await getConnection();

        await pool.request()
            .input('tipoProblema', sql.VarChar, tipoProblema)
            .input('nombreConductor', sql.VarChar, nombreConductor || null)
            .input('numeroPlaca', sql.VarChar, numeroPlaca || null)
            .input('descripcion', sql.VarChar, descripcion)
            .input('fechaProblema', sql.Date, fechaProblema || null)
            .query(`
                INSERT INTO Reportes (TipoProblema, NombreConductor, NumeroPlaca, Descripcion, FechaProblema) 
                VALUES (@tipoProblema, @nombreConductor, @numeroPlaca, @descripcion, @fechaProblema)
            `);

        res.status(201).json({ message: 'Problema reportado exitosamente' });
    } catch (error) {
        console.error('Error al reportar problema:', error);
        res.status(500).json({ error: 'Error al reportar problema' });
    }
};

export const cancelarViaje = async (req, res) => {
    const { viajeId } = req.params;
    const { motivoCancelacion } = req.body;

    if (!motivoCancelacion) {
        return res.status(400).json({ error: 'El motivo de cancelación es obligatorio' });
    }

    try {
        const pool = await getConnection();

        await pool.request()
            .input('viajeId', sql.Int, viajeId)
            .input('motivoCancelacion', sql.VarChar, motivoCancelacion)
            .query(`
                UPDATE Viajes 
                SET Estado = 'Cancelado', MotivoCancelacion = @motivoCancelacion 
                WHERE ViajeID = @viajeId
            `);

        res.status(200).json({ message: 'Viaje cancelado exitosamente' });
    } catch (error) {
        console.error('Error al cancelar viaje:', error);
        res.status(500).json({ error: 'Error al cancelar viaje' });
    }
};

export const pedirViaje = async (req, res) => {
    const { zonaInicio, zonaFin } = req.body;

    if (!zonaInicio || !zonaFin) {
        return res.status(400).json({ error: 'Zona de inicio y zona de fin son requeridas' });
    }

    try {
        const pool = await getConnection();

        const tarifa = await pool.request()
            .input('zonaInicio', sql.VarChar, zonaInicio)
            .input('zonaFin', sql.VarChar, zonaFin)
            .query(`
                SELECT Tarifa 
                FROM Tarifas 
                WHERE ZonaInicio = @zonaInicio AND ZonaFin = @zonaFin
            `);

        if (tarifa.recordset.length === 0) {
            return res.status(400).json({ error: 'No existe tarifa para las zonas seleccionadas' });
        }

        const result = await pool.request()
            .input('zonaInicio', sql.VarChar, zonaInicio)
            .input('zonaFin', sql.VarChar, zonaFin)
            .input('tarifa', sql.Decimal, tarifa.recordset[0].Tarifa)
            .query(`
                INSERT INTO Viajes (ZonaInicio, ZonaFin, Tarifa, Estado)
                OUTPUT INSERTED.ViajeID
                VALUES (@zonaInicio, @zonaFin, @tarifa, 'Pendiente');
            `);

        res.status(201).json({
            viajeId: result.recordset[0].ViajeID,
            tarifa: tarifa.recordset[0].Tarifa,
            estado: 'Pendiente'
        });
    } catch (error) {
        console.error('Error al solicitar viaje:', error);
        res.status(500).json({ error: 'Error al solicitar viaje' });
    }
};

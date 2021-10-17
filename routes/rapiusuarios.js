module.exports = function(app, gestorBD) {

    // Autenticación de usuarios vía token
    app.post("/api/autenticar", function (req, res) {
        // Encriptación de contraseña
        let seguro = app.get("crypto").createHmac('sha256', app.get('clave'))
            .update(req.body.password).digest('hex');

        let criterio = {
            email: req.body.email,
            password: seguro
        }

        // Se buscan las credenciales en BD
        gestorBD.obtenerUsuarios(criterio, function (usuarios) {
            // Error en la búsqueda o usaurio no existente
            if (usuarios == null || usuarios.length === 0) {
                app.get('logger').info("Alguien ha intentado autenticarse en la API sin éxito");
                res.status(401);
                res.json({
                    autenticado: false
                });

                // Existen las credenciales
            } else {
                // Generamos nuevo token
                let token = app.get('jwt').sign(
                    {usuario: criterio.email, tiempo: Date.now() / 1000},
                    "secreto");
                // Introducimos el usuario en sesión
                req.session.usuario = criterio.email;
                // Anotamos en Logger y devolvemos respuesta (con token)
                app.get('logger').info(req.session.usuario + " se ha autenticado en la API");
                res.status(200);
                res.json({
                    autenticado: true,
                    token: token
                });
            }
        });
    });
}
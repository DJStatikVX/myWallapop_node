module.exports = function(app, gestorBD) {

    // Obtener listado de ofertas
    app.get("/api/ofertas", function(req, res) {
        let criterio = {vendedor :{$not: {$eq: req.session.usuario}}};

        gestorBD.obtenerOfertas( criterio , function(ofertas) {
            // Error en la consulta
            if (ofertas == null) {
                app.get('logger').error(req.session.usuario + " ha recibido un error consultando las ofertas de la API");
                res.status(500);
                res.json({
                    error : "Se ha producido un error obteniendo las ofertas."
                })

                // Ofertas obtenidas con éxito
            } else {
                app.get('logger').info(req.session.usuario + " ha consultado las ofertas de la API");
                res.status(200);
                res.send( JSON.stringify(ofertas) );
            }
        });
    });

}
module.exports = function(app, gestorBD) {

    /**
     * envia el id de una oferta sobre la que se quiere chatear
     * es necesario añadir el destinatario solo en caso de que el usuario
     * loggeado sea el vendedor (necesita saber a cual de los potenciales compradores
     * tiene que recibir el mensaje)
     * /api/mensaje/list/id?destinatario=emailComprador
     */
    app.get("/api/mensaje/lista/:id", function(req, res) {
        let ofertaId = gestorBD.mongo.ObjectID(req.params.id);
        let usuario = req.session.usuario;
        let destinatario = req.query.destinatario;

        // Obtenemos la oferta asociada a la conversación
        gestorBD.obtenerOfertas({ "_id" : ofertaId }, function(ofertas) {
            let criterio;

            if (ofertas == null || ofertas.length <= 0) {
                app.get('logger').error(req.session.usuario
                    + " ha obtenido un error recuperando la oferta " + ofertaId
                    + " para obtener su conversación con el ofertante");
                res.status(500);
                res.json({
                    error: "Se ha producido un error recuperando la oferta."
                });
            } else {
                // Determinamos el criterio de búsqueda según si el usuario es el vendedor o no
                let oferta = ofertas[0];
                if (usuario !== oferta.vendedor) { // Interesado
                    criterio = { oferta: ofertaId, emailInteresado: req.session.usuario };
                } else {                          // Propietario
                    if (destinatario == null) {
                        app.get('logger').error(req.session.usuario
                            + " ha obtenido un error recuperando la oferta " + ofertaId
                            + " porque es el vendedor y no ha especificado un destinatario");
                        res.status(400);
                        res.json({
                            error: "No se ha especificado un destinatario."
                        });
                        return;
                    }

                    criterio = { oferta: ofertaId, emailInteresado: destinatario, emailVendedor: req.session.usuario };
                }

                // Obtenemos la conversación
                gestorBD.obtenerConversaciones(criterio, function(conversaciones) {
                    if (conversaciones == null) {
                        app.get('logger').error(req.session.usuario
                            + " ha obtenido un error recuperando los mensajes de la conversación "
                            + conversaciones[0]._id);
                        res.status(500);
                        res.json({
                            error: "Se ha producido un error recuperando los mensajes."
                        });
                        // Caso de que no existan mensajes
                    }else if ( conversaciones.length === 0) {   //no hay mensajes, no lanzamos error sino que devolvemos una lista vacia
                        res.status(200);
                        res.json({
                            mensajes: "No hay mensajes"
                        });
                    }
                    else {
                        // Recuperamos los mensajes una vez obtenida la conversación
                        let criterioMensajes = {
                            conversacion : conversaciones[0]._id
                        }
                        gestorBD.obtenerMensajes(criterioMensajes, function (mensajes){
                            if(mensajes == null){
                                app.get('logger').error(req.session.usuario
                                    + " ha obtenido un error recuperando los mensajes de la conversación "
                                    + conversaciones[0]._id);
                                res.status(500);
                                res.json({
                                    error: "Se ha producido un error recuperando los mensajes."
                                });
                            }
                            else{
                                app.get('logger').info(req.session.usuario
                                    + " ha consultado los mensajes de la conversación " + conversaciones[0]._id);
                                res.status(200);
                                res.send( JSON.stringify(mensajes) );
                            }
                        })
                    }
                });
            }
        });
    });

    /***
     * Marca como leido un mensaje, recibe el id del mensaje, solo puede
     * marcar como leidos mensajes que sean hacia esa persona
     */
    app.get("/api/mensaje/leido/:id", function(req, res) {
        let mensajeId = gestorBD.mongo.ObjectID(req.params.id);
        let usuario = req.session.usuario;
        let criterioMensaje = {
            _id : mensajeId
        }

        // Obtenemos el mensaje de la base de datos
        gestorBD.obtenerMensajes(criterioMensaje, function (mensajes) {
            if(mensajes == null || mensajes.length <= 0){
                app.get('logger').error(req.session.usuario
                    + " ha obtenido un error recuperando el mensaje " + mensajeId + " para marcarlo como leído");
                res.status(500);
                res.json({
                    error: "Se ha producido un error recuperando el mensaje"
                });
                return;
            }

            let mensaje = mensajes[0]
            let criterioConver = {
                _id : mensaje.conversacion
            }

            // Obtenemos la conversación para comprobar que el usuario pueda marcar el mensaje como leído
            gestorBD.obtenerConversaciones(criterioConver, function (conversaciones){
                if(conversaciones == null || conversaciones.length <= 0){
                    app.get('logger').error(req.session.usuario
                        + " ha obtenido un error recuperando la conversación del mensaje " + mensajeId
                        + " para marcarlo como leído");
                    res.status(500);
                    res.json({
                        error: "Se ha producido un error recuperando la conversacion"
                    });
                    return;
                }

                let conversacion = conversaciones[0];
                if((conversacion.emailVendedor === usuario || conversacion.emailInteresado === usuario)
                    && mensaje.remitente !== usuario){
                    //se puede enviar
                    mensaje.leido = true;
                    gestorBD.modificarMensaje(criterioMensaje, mensaje, function (result){
                        if(result == null){
                            app.get('logger').error(req.session.usuario
                                + " ha obtenido un error marcando como leído el mensaje " + mensajeId);
                            res.status(500);
                            res.json({
                                error: "Se ha producido un error, al modificar el mensaje"
                            });
                            return;
                        }

                        // Leído con éxito
                        app.get('logger').info(req.session.usuario
                            + " ha marcado como leído el mensaje " + mensajeId);
                        res.status(200);
                        res.json({
                            estado :"leido con exito"
                        });
                    });
                }
                // Error en caso de que pertenezca a una conversación ajena
                else{
                    app.get('logger').error(req.session.usuario
                        + " ha obtenido un error marcando como leído el mensaje " + mensajeId
                        + " porque pertenece a una conversación ajena");
                    res.status(403);
                    res.json({
                        error: "Se ha producido un error, no puede marcar este mensaje como leido"
                    });
                }
            })
        })
    });

    /***
     * Peticion que envia el mensaje
     * el id de la oferta como parametro en la url
     * el texto y el destino (solo necesario si eres el vendedor) en el body
     */
    app.post("/api/mensaje/enviar/:id", function(req, res) {
        // Criterio de búsqueda
        let ofertaId = gestorBD.mongo.ObjectID(req.params.id);
        let criterio = {"_id" : ofertaId}
        let texto = req.body.texto;
        let destino = req.body.destino;

        // Por si se reinicia el servidor mientras el token es válido
        if (req.session.usuario == null) {
            app.get('logger').error("Alguien ha intentado enviar un mensaje en una conversación sobre la oferta "
                + req.params.id + ", pero su token ha expirado")
            res.status(511);
            res.json({
                error: "Su sesión ha caducado. Por favor, vuelva a autenticarse"
            });
            return;
        }

        // Buscamos la oferta asociada a la conversación
        gestorBD.obtenerOfertas( criterio , function(ofertas) {
            if (ofertas == null) {
                app.get('logger').error(req.session.usuario + " ha intentado enviar un mensaje en una conversación "
                + "sobre la oferta " + req.params.id + ", pero no se ha encontrado la oferta");
                res.status(404);
                res.json({
                    error: "No existe esa oferta"
                })
                return;
            }

            // Comprobación de si es posible enviar el mensaje desde el usuario autenticado
            let oferta = ofertas[0];
            puedeEnviarMensaje(oferta, req.session.usuario, destino, function(puedeEnviar) {
                if (!puedeEnviar) {
                    app.get('logger').error(req.session.usuario + " ha intentado enviar un mensaje en una conversación "
                        + "sobre la oferta " + req.params.id + ", pero no tiene permiso para ello.");
                    res.status(403);
                    res.json({
                        error: "Se ha producido un error, no se puede enviar el mensaje"
                    })
                    return;
                }

                // Datos del nuevo mensaje
                var hoy = new Date();

                let mensaje = {
                    texto : texto,
                    remitente : req.session.usuario,
                    fecha : hoy,
                    leido : false
                };

                // Buscar el ObjectID de conversación
                let criterioConversacion = {
                    emailVendedor : oferta.vendedor,
                    emailInteresado: oferta.vendedor === req.session.usuario ? destino: req.session.usuario,
                    oferta: ofertaId
                };

                // Buscamos la conversacion (puede que no exista ninguna al insertar un mensaje)
                gestorBD.obtenerConversaciones(criterioConversacion, function(conversaciones) {
                    if (conversaciones == null) {
                        app.get('logger').error(req.session.usuario + " ha intentado enviar un mensaje en una conversación "
                            + "sobre la oferta " + req.params.id + ", pero se ha producido un error obteniendo la conversación.");
                        res.status(500);
                        res.json({
                            error: "Se ha producido un error recuperando la conversación."
                        });
                        // Si no existe, la creamos
                    } else if (conversaciones.length === 0) {
                        let conversacion = {
                            emailVendedor : oferta.vendedor,
                            emailInteresado: oferta.vendedor === req.session.usuario ? destino: req.session.usuario,
                            oferta: gestorBD.mongo.ObjectID(ofertaId),
                            tituloOferta: oferta.titulo
                        };
                        gestorBD.insertarConversacion(conversacion, function(result) {
                            if (result == null) {
                                app.get('logger').error(req.session.usuario
                                    + " ha intentado enviar un mensaje en una conversación "
                                    + "sobre la oferta " + req.params.id
                                    + ", pero se ha producido un error creando la conversación.");
                                res.status(500);
                                res.json({
                                    error: "se ha producido un error creando la conversación."
                                });
                            } else {
                                mensaje["conversacion"] = result;
                                // Insertamos el nuevo mensaje referenciando a la nueva conversación
                                gestorBD.insertarMensaje(mensaje, function (id) {
                                    if (id == null) {
                                        app.get('logger').error(req.session.usuario
                                            + " ha intentado enviar un mensaje en una conversación "
                                            + "sobre la oferta " + req.params.id
                                            + ", pero se ha producido un error en el envío.");
                                        res.status(500);
                                        res.json({
                                            error: "Se ha producido un error al enviar el mensaje"
                                        });
                                        return;
                                    }

                                    // Mensaje enviado con éxito
                                    app.get('logger').info(req.session.usuario + " ha enviado un nuevo mensaje: " + id);
                                    res.status(200);
                                    res.json({
                                        mensajeCreado: true
                                    });
                                });
                            }
                        });

                        // Sobre conversaciones existentes no es necesario crear la conversación
                    } else if (conversaciones.length > 0) {
                        mensaje["conversacion"] = conversaciones[0]._id;
                        gestorBD.insertarMensaje(mensaje, function (id) {
                            if (id == null) {
                                app.get('logger').error(req.session.usuario
                                    + " ha intentado enviar un mensaje en una conversación "
                                    + "sobre la oferta " + req.params.id + ", pero se ha producido un error en el envío.");
                                res.status(500);
                                res.json({
                                    error: "Se ha producido un error al enviar el mensaje"
                                })
                            }

                            // Mensaje enviado con éxito
                            app.get('logger').info(req.session.usuario + " ha enviado un nuevo mensaje: " + id);
                            res.status(200);
                            res.json({
                                mensajeCreado: true
                            });
                        });
                    }
                });
            });
        })
    });

    /***
     * busca la lista de conversaciones, ademas, para cada conversacion muestra el numero de mensajes sin leer
     */
    app.get("/api/conversacion/lista", function(req, res) {
        let criterio = { $or: [{ emailVendedor: req.session.usuario }, { emailInteresado: req.session.usuario }] };
        gestorBD.obtenerConversaciones(criterio, function(conversaciones) {
            if (conversaciones == null) {
                app.get('logger').error(req.session.usuario + " ha obtenido un error consultando sus conversaciones");
                res.status(500);
                res.json({
                    error: "Se ha producido un error obteniendo la lista de conversaciones."
                });
                return;
            }

            app.get('logger').info(req.session.usuario + " ha consultado sus conversaciones");

            res.status(200);
            res.send(JSON.stringify(conversaciones));
        });
    });

    /**
     * Obtener el número de mensajes pendientes para el usuario en sesión dada una conversación
     * @param id identificador de la conversación
     */
    app.get("/api/conversacion/pendientes/:id", function (req,res) {
        let criterio = {
            $and : [{leido : false}, {conversacion : gestorBD.mongo.ObjectID(req.params.id) },
                { remitente : {$not : {$eq : req.session.usuario}}}]
        }

        gestorBD.contarMensajes(criterio, function (result){
            if(result === null){
                app.get('logger').error(req.session.usuario
                    + " ha obtenido un error consultando sus mensajes pendientes en la conversación " + req.params.id);
                res.status(500);
                res.json({
                    error: "Se ha producido un error, al contar los mensajes"
                });
            }
            else{
                app.get('logger').info(req.session.usuario
                    + " ha consultado el número de mensajes pendientes para la conversación " + req.params.id);
                res.status(200);
                res.json({
                    numero: result
                });
            }
        })
    });

    /**
     * Elimina la conversación pasada como parámetro si el usuario es propietario o interesado en ella
     * @param id identificador de la conversación a eliminar
     */
    app.get("/api/conversacion/eliminar/:id", function(req, res) {
        let criterio = {_id :gestorBD.mongo.ObjectID(req.params.id)}
        // Buscamos la conversación a eliminar
        gestorBD.obtenerConversaciones(criterio, function (convers){
            let conver = convers[0];
            // Lanzar un error si se intenta eliminar una conversación ajena
            if(conver.emailInteresado !== req.session.usuario && conver.emailVendedor !== req.session.usuario){
                app.get('logger').error(req.session.usuario
                    + " ha intentado eliminar una conversación ajena: " + req.params.id);
                res.status(403);
                res.json({
                    error: "Se ha producido un error, no puedes borrar esta conversacion"
                });
                return;
            }

            // Si se puede eliminar, se procede con ello
            gestorBD.eliminarConversacion(criterio, function (result){
                if(result == null){
                    app.get('logger').error(req.session.usuario
                        + " ha obtenido un error eliminando la conversación " + req.params.id);
                    res.status(500);
                    res.json({
                        error: "Se ha producido un error al eliminar la conversacion"
                    });
                }
                else{
                    app.get('logger').info(req.session.usuario + " ha eliminado la conversación " + req.params.id);
                    res.status(200);
                    res.json({
                        estado :"borrado con exito"
                    });
                }
            })
        })

    });

    /**
     * Comprueba si un mensaje puede ser enviado o no
     * @param oferta oferta a la que está vinculada la conversación, si existe
     * @param email email del propietario
     * @param emailInteresado email del interesado
     * @param funcionCallback retorno
     */
    function puedeEnviarMensaje(oferta,email,emailInteresado, funcionCallback){
        //puedo enviar mensaje si soy un potencial comprador o si ya existe esa conversacion
        if(oferta.comprador == null && email !== oferta.vendedor){
            funcionCallback(true);
        }
        else{
            let criterio = {$and: [ {emailVendedor: email},{oferta: oferta._id }, { emailInteresado : emailInteresado} ]}
            gestorBD.obtenerConversaciones(criterio, function(conversaciones){
                if(conversaciones == null || conversaciones.length === 0){
                    funcionCallback(false);
                }
                else{
                    funcionCallback(true);  //ya existe la conversacion
                }
            })
        }
    }
}
module.exports = function(app, swig, gestorBD) {

    /**
     * Petición para mostrar las ofertas propias
     */
    app.get("/oferta/propias", function (req, res){
        let criterio = {vendedor: req.session.usuario.email};
        gestorBD.obtenerOfertas(criterio, function (ofertas){
            if(ofertas == null){
                res.send("Error al listar");

                // Obtener las ofertas y comprobar si pueden ser eliminadas
            } else {
                for (let i = 0; i < ofertas.length; i++) {
                    ofertas[i]["puedeEliminar"] = ofertas[i].comprador == null;
                }
                // Registramos petición y retornamos la vista
                app.get('logger').info(req.session.usuario.email + " ha consultado sus ofertas propias");
                let respuesta = swig.renderFile("views/bofertaspropias.html",
                    {
                        usuario : req.session.usuario,
                        ofertas : ofertas
                    });
                res.send(respuesta);
            }
        });
    });

    /**
     * Obtener los detalles de una oferta
     */
    app.get("/oferta/detalle/:id", function (req, res, next){
        // Criterios de búsqueda
        let ofertaId = gestorBD.mongo.ObjectID(req.params.id);
        let criterio = {"_id" : ofertaId}
        gestorBD.obtenerOfertas( criterio, function (oferta){
            if(oferta == null){
                next(new Error("Error al recuperar la oferta para ver detalles"))
            }
            // Obtenemos sus detalles y retornamos la vista
            else{
                app.get('logger').info(req.session.usuario.email
                    + " ha consultado los detalles de la oferta " + ofertaId);
                let respuesta = swig.renderFile("views/boferta.html",
                    {
                        oferta : oferta[0],
                        usuario: req.session.usuario
                    });
                res.send(respuesta);
            }
        })
    });

    /**
     * Consultar las ofertas compradas por el usuario
     */
    app.get("/oferta/compradas", function (req, res){
        let criterio = {comprador: req.session.usuario.email};
        gestorBD.obtenerOfertas(criterio, function (ofertas){
            if(ofertas == null){
                res.send("Error al listar");
            } else {
                app.get('logger').info(req.session.usuario.email + " ha consultado sus ofertas compradas");
                let respuesta = swig.renderFile("views/bofertascompradas.html",
                    {
                        usuario : req.session.usuario,
                        ofertas : ofertas
                    });
                res.send(respuesta);
            }
        });
    });

    /**
     * Explorar y buscar ofertas
     */
    app.get("/oferta/buscar", function (req, res, next){
        let criterio = {};
        // Si hay algo en la barra de búsqueda, se especifica un criterio
        if( req.query.busqueda != null ){
            criterio = { "titulo" : {$regex : ".*"+req.query.busqueda+".*", $options: 'i'} };
        }
        // Página a mostrar (si se especificó)
        let pg = parseInt(req.query.pg); // Es String !!!
        if ( req.query.pg == null){ // Puede no venir el param
            pg = 1;
        }
        // Obtenemos dichas ofertas (filtradas o no) con paginación
        gestorBD.obtenerOfertasPg(criterio, pg,  function (ofertas, total){
            if(ofertas == null){
                next(new Error("Error al listar"));
            } else {
                let ultimaPg = total/5;
                if (total % 5 > 0 ){ // Sobran decimales
                    ultimaPg = ultimaPg+1;
                }
                let paginas = []; // paginas mostrar
                for(let i = pg-2 ; i <= pg+2 ; i++){
                    if ( i > 0 && i <= ultimaPg){
                        paginas.push(i);
                    }
                }

                // Registramos petición y retornamos la vista
                let stringUsuario = req.session.usuario ? req.session.usuario.email :  "Alguien";
                app.get('logger').info(stringUsuario + " está explorando ofertas");
                let respuesta = swig.renderFile("views/bbuscar.html",
                    {
                        usuario : req.session.usuario,
                        ofertas : ofertas,
                        paginas : paginas,
                        actual : pg,
                        busqueda : req.query.busqueda
                    });
                res.send(respuesta);
            }
        });
    });

    /**
     * Retornar vista para añadir una nueva oferta
     */
    app.get("/oferta/agregar", function(req, res) {
        app.get('logger').info(req.session.usuario.email + " va a añadir una nueva oferta");
        let respuesta = swig.renderFile('views/bagregar.html', {
            usuario : req.session.usuario
        });

        res.send(respuesta);
    });

    /**
     * Promocionar una oferta
     */
    app.get("/oferta/promocionar/:id", function (req, res, next) {
        let criterio =  { "_id" :  gestorBD.mongo.ObjectID(req.params.id)}
        let critUser = { "email": req.session.usuario.email}
        // Comprobar si la oferta pertenece al usuario
        gestorBD.obtenerOfertas(criterio, function (ofertas) {
            if (ofertas == null || ofertas.length === 0) {
                next(new Error("Ha habido un problema al recuperar la oferta"));
            } else {
                let oferta = ofertas[0]
                // Error si no es suya o no tiene saldo suficiente
                if (oferta.promocionada || req.session.usuario.saldo < 20 ||
                    oferta.vendedor !== req.session.usuario.email) {
                    next(new Error("No puedes promocionar esta oferta"))

                    // En caso contrario, se actualiza en BD
                } else {
                    oferta.promocionada = true;
                    gestorBD.modificarOferta(criterio, oferta, function (modoferta) {
                        if (modoferta == null) {
                            next(new Error("Error al promocionar la oferta"))
                        }
                        else{
                            // Y se resta el saldo al usuario
                            let usuario = req.session.usuario;
                            usuario.saldo -= 20;
                            gestorBD.modificarSaldoUsuario(critUser, usuario.saldo, function (result){
                                if(result == null) {
                                    next(new Error("se ha producido un error actualizando el saldo del usuario"));
                                }
                                else{
                                    res.redirect("/oferta/propias");
                                }
                            })
                            app.get('logger').info(req.session.usuario.email + " ha promocionado la oferta "
                                + oferta.titulo );
                        }
                    })
                }
            }
        })

    });

    /**
     * Petición POST para eliminar una oferta
     */
    app.get("/oferta/eliminar/:id", function(req, res, next) {
        let ofertaId = gestorBD.mongo.ObjectID(req.params.id);

        // Se comprueba si es propietario y si aún no se ha vendido
        puedeEliminarOferta(req.session.usuario.email, ofertaId, function(puedeEliminar) {
            if (puedeEliminar) {
                // En caso afirmativo, borramos
                let criterio = { "_id" : ofertaId };
                gestorBD.eliminarOferta(criterio,function(ofertas){
                    if ( ofertas == null ){
                        next(new Error("Se ha producido un error borrando la oferta."));
                    } else {
                        app.get('logger').info(req.session.usuario.email + " ha eliminado la oferta " + ofertaId);
                        res.redirect("/oferta/propias?mensaje=Oferta eliminada con éxito.&tipoMensaje=alert-success");
                    }
                });
            } else {
                next(new Error("Lo sentimos, no puedes eliminar esta oferta."));
            }
        });
    });


    /**
     * Petición POST para comprar una oferta
     */
    app.get("/oferta/comprar/:id", function(req, res,next) {
        let criterio = {"_id" : gestorBD.mongo.ObjectID(req.params.id) };
        let critComprador = {"email" : req.session.usuario.email};
        // Se comprueba si el usuario puede comprarla
        puedeComprarOferta(req.session.usuario, req.params.id, function (puedeComprar){
            gestorBD.obtenerOfertas(criterio, function (ofertas){
                if(ofertas == null){
                    next(new Error("Error al recuperar la oferta"));
                } else{
                    // Se marca al interesado como comprador de la oferta
                    let critVendedor = {"email" : ofertas[0].vendedor};
                    ofertas[0].comprador =req.session.usuario.email;
                    gestorBD.modificarOferta(criterio, ofertas[0], function (modOfertas){
                        if(modOfertas == null){
                            next(new Error("se ha producido un error comprando la oferta"));
                        }
                        else{
                            // Se actualiza el saldo (si tiene dinero suficiente(
                            let nuevoSaldo = req.session.usuario.saldo - ofertas[0].precio;
                            if (nuevoSaldo >= 0) {
                                req.session.usuario.saldo -= ofertas[0].precio;
                                gestorBD.modificarSaldoUsuario(critComprador, req.session.usuario.saldo, function (usuario) {
                                    if (usuario == null) {
                                        next(new Error("Se ha producido un error al actualizar el saldo"));
                                    } else {
                                        gestorBD.obtenerUsuarios(critVendedor, function (vendedor) {
                                            if (vendedor == null || vendedor.length <= 0) {
                                                next(new Error("se ha producido un error recuperando el vendedor de la oferta"));
                                            } else {
                                                // Se actualiza el saldo del ofertante
                                                vendedor[0].saldo = parseInt(ofertas[0].precio) + parseInt(vendedor[0].saldo);
                                                gestorBD.modificarSaldoUsuario(critVendedor, vendedor[0].saldo, function (vendedorMod) {
                                                    if (vendedorMod == null) {
                                                        next(new Error("se ha producido un error actualizando el saldo del vendedor"));
                                                    } else {
                                                        app.get('logger').info(req.session.usuario.email + " ha comprado la oferta "
                                                            + ofertas[0].titulo + " (" + ofertas[0]._id.toString() + ")");
                                                        res.redirect("/oferta/buscar");
                                                    }
                                                })
                                            }
                                        });
                                    }
                                });
                                // Error si no hay saldo suficiente
                            } else {
                                app.get('logger').error(req.session.usuario.email + " ha intentado comprar la oferta "
                                    + ofertas[0]._id.toString() + " pero no tiene saldo suficiente.");
                                next(new Error("No tienes saldo suficiente para comprar esta oferta."));
                            }
                        }
                    })
                }
            })
        })
    })

    /**
     * Petición POST para añadir una nueva oferta
     */
    app.post("/oferta/agregar", function(req, res) {
        // Obtenemos fecha actual para la oferta
        var hoy = new Date();
        var dd = String(hoy.getDate()).padStart(2, '0');
        var mm = String(hoy.getMonth() + 1).padStart(2, '0');
        var yyyy = hoy.getFullYear();

        hoy = dd + '/' + mm + '/' + yyyy;

        // Validamos los datos
        let mensajeError = validarOferta(req.body);
        if (mensajeError != null) {
            res.redirect("/oferta/agregar?mensaje=" + mensajeError + "&tipoMensaje=alert-danger");
            return;
        }

        let promocion = ! (req.body.promoted == null);
        // Objeto oferta a insertar
        let oferta = {
            titulo : req.body.titulo,
            detalle : req.body.detalle,
            precio : req.body.precio,
            fecha: hoy,
            vendedor : req.session.usuario.email,
            comprador : null,
            promocionada : promocion

        }

        // Si se decide promocionar, comprobar si hay dinero suficiente
        if( promocion){
            if( req.session.usuario.saldo <= 20){
                mensajeError = "Se requieren 20€ para promocionar oferta"
                res.redirect("/oferta/agregar?mensaje=" + mensajeError + "&tipoMensaje=alert-danger");
            }
            else{
                // Caso contrario, buscamos el usuario y restamos de su saldo
                let criterio = {"email" : req.session.usuario.username};
                gestorBD.obtenerUsuarios(criterio, function (result) {
                    if (result == null || result.length >0) {
                        next(new Error("Se ha producido un error obtener al usuario"));
                    } else {
                        let usuario = req.session.usuario;
                        usuario.saldo -= 20;
                        gestorBD.modificarSaldoUsuario(criterio, usuario.saldo, function (finalResult) {
                            if (finalResult == null) {
                                next(new Error("Se ha producido un error al promocionar "));
                            }
                            else{
                                // Finalmente, la guardamos en la base de datos
                                gestorBD.insertarOferta(oferta, function(id){
                                    if (id == null){
                                        let respuesta = swig.renderFile('views/error.html', {
                                            usuario : req.session.usuario,
                                            mensaje: "Se ha producido un error al agregar la oferta."
                                        });
                                        res.send(respuesta);
                                    } else {
                                        app.get('logger').info(req.session.usuario.email + " ha agregado la oferta "
                                            + oferta.titulo + " (" + oferta._id.toString() + ")");
                                        res.redirect("/oferta/propias?mensaje=¡Oferta añadida con éxito!&tipoMensaje=alert-success");
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
        // Si no hay promoción
        else {
            // La guardamos en la base de datos
            gestorBD.insertarOferta(oferta, function(id){
                if (id == null){
                    let respuesta = swig.renderFile('views/error.html', {
                        usuario : req.session.usuario,
                        mensaje: "Se ha producido un error al agregar la oferta."
                    });
                    res.send(respuesta);
                } else {
                    app.get('logger').info(req.session.usuario.email + " ha agregado la oferta "
                        + oferta.titulo + " (" + oferta._id.toString() + ")");
                    res.redirect("/oferta/propias?mensaje=¡Oferta añadida con éxito!&tipoMensaje=alert-success");
                }
            });
        }
    });

    /**
     * Validar los campos del formulario de añadir oferta
     * @param cuerpo cuerpo de la petición POST
     * @returns {string} mensaje de error, si no es null
     */
    function validarOferta(cuerpo) {
        // Validación de campos vacíos
        if (cuerpo.titulo == null || cuerpo.titulo.trim().length === 0
            || cuerpo.detalle == null || cuerpo.detalle.trim().length === 0
                || cuerpo.precio == null || cuerpo.precio.trim().length === 0) {
            return "Debes rellenar todos los campos.";
        }

        // Validaciones de longitud
        if (cuerpo.titulo.length < 5 || cuerpo.titulo.length > 20) {
            return ("La longitud del título debe ser de entre 5 y 20 caracteres.")
        }

        if (cuerpo.detalle.length < 10 || cuerpo.titulo.length > 40) {
            return ("La longitud de la descripción debe ser de entre 10 y 40 caracteres.")
        }

        if (cuerpo.precio < 0) {
            return ("El precio del artículo no puede ser negativo.")
        }
    }

    /**
     * Determina si el usuario en sesión puede borrar una oferta
     * @param usuario email del usuario en sesión
     * @param ofertaId ID de la oferta que se intenta eliminar
     * @param funcionCallback true si se puede eliminar; false en otro caso
     */
    function puedeEliminarOferta(usuario, ofertaId, funcionCallback) {
        let criterioVendedor = { $and: [{ "_id" : ofertaId }, { "vendedor" : usuario }] };
        let criterioVendida = { $and: [{ "_id" : ofertaId }, { "comprador" : null }] };

        // Se consulta la oferta para ver si es propia y está vendida o no
        gestorBD.obtenerOfertas(criterioVendedor, function(ofertas) {
           if (ofertas.length > 0) {
               gestorBD.obtenerOfertas(criterioVendida, function(ofertasVendidas) {
                   if (ofertasVendidas.length > 0) {
                       funcionCallback(true);
                   } else {
                       funcionCallback(false);
                   }
               });
           } else {
                funcionCallback(false);
           }
        });
    }

    /**
     * Determina si el usuario en sesión puede comprar una oferta
     * @param usuario email del usuario en sesión
     * @param ofertaId ID de la oferta que se intenta comprar
     * @param funcionCallback true si se puede comprar; false en otro caso
     */
    function puedeComprarOferta(usuario,ofertaId, funcionCallback) {
        let criterio = {"_id": gestorBD.mongo.ObjectID(ofertaId)};
        let isBought = {$and: [{"_id": gestorBD.mongo.ObjectID(ofertaId)}, { "comprador": usuario}]};

        // Se consulta la oferta para ver si no es propia y está vendida o no
        gestorBD.obtenerOfertas(criterio, function (ofertas){
            if(ofertas == null || ofertas.length <=0 || ofertas[0].vendedor === usuario.email
                || ofertas[0].precio > usuario.saldo){
                funcionCallback(false);
            }
           else{
               gestorBD.obtenerOfertas(isBought, function (comprada){
                   if(comprada == null || comprada.length >0){
                       funcionCallback(false);
                   }
                   else{
                       funcionCallback(true);
                   }
               })
           }
        });
    }

}
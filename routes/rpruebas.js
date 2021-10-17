module.exports = function(app, gestorBD) {

    /**
     * Resetear la base de datos y retornar un mensaje en texto plano
     */
    app.get("/resetear", function(req, res) {
        app.get('logger').info("Se ha intentado resetear la base de datos");
        gestorBD.resetear(function (result) {
            result ? res.send("Base de datos reseteada con éxito.")
                : res.send("Se ha producido un error reseteando la base de datos.");
        });
    });

    /**
     * Insertar datos de prueba en la BD
     */
    app.get("/insertarDatos", function(req, res) {
        // Encriptación de contraseña (casi todos usan la misma, ¡no hacer en producción!)
        let seguro = app.get("crypto").createHmac('sha256', app.get('clave'))
            .update("123123").digest('hex');

        let u1 = {
            email : "taso@correo.es",
            nombre : "taso",
            apellidos : "tasez",
            password : seguro
            ,
            saldo : 100,
            perfil : "Usuario Estándar"
        }
        let u2 = {
            email : "samuel@correo.es",
            nombre : "samuel",
            apellidos : "samuelez",
            password : seguro
            ,
            saldo : 400,
            perfil : "Usuario Estándar"
        }
        let u3 = {
            email : "juan@correo.es",
            nombre : "juan",
            apellidos : "juanez",
            password : seguro
            ,
            saldo : 300,
            perfil : "Usuario Estándar"
        }
        let u4 = {
            email : "maria@correo.es",
            nombre : "maria",
            apellidos : "mariez",
            password : seguro
            ,
            saldo : 500,
            perfil : "Usuario Estándar"
        }
        let u5 = {
            email : "ana@correo.es",
            nombre : "ana",
            apellidos : "anez",
            password : seguro
            ,
            saldo : 500,
            perfil : "Usuario Estándar"
        }
        let u6 = {
            email : "bea@correo.es",
            nombre : "bea",
            apellidos : "beez",
            password : seguro
            ,
            saldo : 18,
            perfil : "Usuario Estándar"
        }
        let admin = {
            email : "admin@email.com",
            nombre : "admin",
            apellidos : "adminez",
            // Encriptación de contraseña "admin"
            password : app.get("crypto").createHmac('sha256', app.get('clave'))
                .update("admin").digest('hex')
            ,
            saldo : 100,
            perfil : "Administrador"
        }

        gestorBD.insertarUsuarios([u1,u2,u3,u4,u5,u6,admin], function (result){
            if(result){//ha funcionado, insertamos las ofertas
                insertarOfertas(req, res);
            }
        })

    });

    /**
     * Insertar datos de prueba de las conversaciones
     * @param req petición del usuario
     * @param res respuesta del servidor
     */
    function insertarConversaciones(req, res) {
        let criterio = {
            perfil: "Usuario Estándar"
        }
        gestorBD.obtenerUsuarios(criterio, function (usuarios){
            let control = 0;    //controla si han acabado todos los metodos
            if(usuarios != null){
                for(let i = 0; i< usuarios.length; i++){

                    //asigno la persona con la que creara una conversacion
                    let destinatario = i +1;
                    if(destinatario === usuarios.length){
                        destinatario = 0;
                    }

                    // insertamos las conversaciones para cada usuario
                    crearConversacion(req, res, usuarios[i].email, usuarios[destinatario].email, function (result){
                        if(result != null){
                            control++;
                            if(control === usuarios.length){
                                res.send("datos insertados con éxito.")
                            }
                        }
                    })
                }
            }
        })

    }

    /**
     * Crea una conversación con los datos proporcionados
     * @param req petición del usuario
     * @param res respuesta del servidor
     * @param interesado email de la persona interesada
     * @param vendedor email del ofertante
     * @param funcionCallback retorno
     */
    function crearConversacion(req, res, interesado, vendedor, funcionCallback) {
        let criterioOferta = {
            vendedor : vendedor,
            comprador : null
        }

        // Buscamos la oferta para la que se quiere crear la conversación
        gestorBD.obtenerOfertas(criterioOferta, function(ofertas){
            if(ofertas != null){
                // Creamos objeto conversación con los datos pasados
                let conversacion = {
                    emailVendedor : vendedor,
                    emailInteresado : interesado,
                    oferta : ofertas[0]._id,
                    tituloOferta : ofertas[0].titulo
                }

                // La insertamos en la base de datos
                gestorBD.insertarConversacion(conversacion, function(result){
                    if(result != null){
                        // Insertamos un primer mensaje
                        let mensaje1 = {
                            texto : "hola, estoy interesado",
                            remitente: interesado,
                            fecha : "11/5/2021",
                            leido : true,
                            conversacion : result
                        }

                        gestorBD.insertarMensaje(mensaje1, function(mensajeid){
                            if(mensajeid != null){
                                // E insertamos un segundo mensaje como respuesta
                                let mensaje2 = {
                                    texto : "vale, pues paga el dinero",
                                    remitente: vendedor,
                                    fecha : "12/5/2021",
                                    leido : false,
                                    conversacion : result
                                }
                                gestorBD.insertarMensaje(mensaje2, function(mensajeid){
                                    if(mensajeid != null){
                                        funcionCallback(true)
                                    }
                                });
                            }
                        })
                    }
                })
            }
            // Caso de error
            funcionCallback(null)
        })
    }

    /**
     * Genera ofertas de prueba y las inserta
     * @param req petición del cliente
     * @param res respuesta del servidor
     */
    function insertarOfertas(req, res) {

        of61 = {
            titulo: "oferta bea 1",
            detalle: "descripcion oferta 1",
            precio : 2,
            fecha : "11/05/2021",
            vendedor : "bea@correo.es",
            comprador : null ,
            promocionada : false
        }

        of62 = {
            titulo: "oferta bea 2",
            detalle: "descripcion oferta 2",
            precio : 777,
            fecha : "11/05/2021",
            vendedor : "bea@correo.es",
            comprador : null ,
            promocionada : false
        }

        of51 = {
            titulo: "oferta maria 1",
            detalle: "descripcion oferta 1",
            precio : 2,
            fecha : "11/05/2021",
            vendedor : "maria@correo.es",
            comprador : null ,
            promocionada : false
        }

        of52 = {
            titulo: "oferta maria 2",
            detalle: "descripcion oferta 2",
            precio : 76,
            fecha : "11/05/2021",
            vendedor : "maria@correo.es",
            comprador : null ,
            promocionada : false
        }

        of41 = {
            titulo: "oferta juan 1",
            detalle: "descripcion oferta 1",
            precio : 5,
            fecha : "11/05/2021",
            vendedor : "juan@correo.es",
            comprador : null ,
            promocionada : true
        }

        of42 = {
            titulo: "oferta juan 2",
            detalle: "descripcion oferta 2",
            precio : 12,
            fecha : "11/05/2021",
            vendedor : "juan@correo.es",
            comprador : "ana@correo.es" ,
            promocionada : true
        }

        of43 = {
            titulo: "oferta juan 3",
            detalle: "descripcion oferta 3",
            precio : 4,
            fecha : "11/05/2021",
            vendedor : "juan@correo.es",
            comprador : null ,
            promocionada : false
        }

        of31 = {
            titulo: "oferta ana 1",
            detalle: "descripcion oferta 1",
            precio : 400,
            fecha : "11/05/2021",
            vendedor : "ana@correo.es",
            comprador : null ,
            promocionada : false
        }

        of32 = {
            titulo: "oferta ana 2",
            detalle: "descripcion oferta 2",
            precio : 12,
            fecha : "11/05/2021",
            vendedor : "ana@correo.es",
            comprador : "samuel@correo.es" ,
            promocionada : true
        }

        of21 = {
            titulo: "oferta samuel 1",
            detalle: "descripcion oferta 1",
            precio : 45,
            fecha : "11/05/2021",
            vendedor : "samuel@correo.es",
            comprador : null ,
            promocionada : true
        }

        of22 = {
            titulo: "oferta samuel 2",
            detalle: "descripcion oferta 2",
            precio : 20,
            fecha : "11/05/2021",
            vendedor : "samuel@correo.es",
            comprador : "taso@correo.es" ,
            promocionada : false
        }

        of11 = {
            titulo: "oferta taso 1",
            detalle: "descripcion oferta 1",
            precio : 10,
            fecha : "11/05/2021",
            vendedor : "taso@correo.es",
            comprador : null ,
            promocionada : false
        }

        of12 = {
            titulo: "oferta taso 2",
            detalle: "descripcion oferta 2",
            precio : 20,
            fecha : "11/05/2021",
            vendedor : "taso@correo.es",
            comprador : "bea@correo.es" ,
            promocionada : false
        }

        gestorBD.insertarOfertas( [of11,of12,of21,of22,of31,of32,of41,of42,of43,of51,of52, of61,of62] ,
            function(result){
            if(result)
                insertarConversaciones(req,res);
        } )

    }

}
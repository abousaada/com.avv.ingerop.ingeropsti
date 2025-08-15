sap.ui.define(
    [
        "sap/ui/core/mvc/ControllerExtension",
        "sap/m/Dialog",
        "sap/m/library",
        "sap/m/Text",
        "sap/m/Button",
        "sap/m/MessageToast",
        "sap/ui/core/message/MessageType",
        "sap/m/library"
    ],
    function (ControllerExtension, Dialog, mLibrary, Text, Button, MessageToast, MessageType, library) {
        "use strict";

        return ControllerExtension.extend("com.avv.ingerop.ingeropsti.ext.controller.extendLR", {

            // this section allows to extend lifecycle hooks or hooks provided by Fiori elements
            override: {
                /**
                * Called when a controller is instantiated and its View controls (if available) are already created.
                * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time       initialization.
                * @memberOf sap.fe.cap.customer.ext.controller.PassengerOPExtend
                */

                onInit: function () {
                    // you can access the Fiori elements extensionAPI via this.base.getExtensionAPI

                    // this.base.getView().byId("addEntry").bindProperty("enabled", {
                    //     path: "utilities>/year",
                    //     formatter: this.getInterface().isYearEmpty
                    // });
                },

                onInitSmartFilterBarExtension: function (oEvent) {
                    //set Year Data on List Report Page
                    oEvent.getSource().attachFilterChange(function (event) {
                        if (event.getParameters().getParameter("id").includes("p_period")) {
                            const period = event.getParameters().getParameter("newValue");
                            this.getModel("utilities").setYearByPeriod(period);
                        }
                    });
                },


                onBeforeRebindTableExtension: function (oEvent) {

                }

            },
        });
    });
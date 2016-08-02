/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 * http://laxarjs.org/license
 */

import * as ng from 'angular';
import * as ax from 'laxar';
import * as patterns from 'laxar-patterns';
import 'laxar-accordion-control/ax-accordion-control';

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

Controller.$inject = [ '$scope', 'axEventBus', 'axFeatures', 'axLog', 'axVisibility' ];

function Controller( $scope, eventBus, features, log, visibility ) {

   let requestedPanelIndex = -1;
   let allowNextPanelActivation = false;

   $scope.model = {
      panels: [],
      selectedPanel: 0
   };

   const localize = patterns.i18n.handlerFor( $scope ).scopeLocaleFromFeature( 'i18n', {
      onChange() {
         $scope.model.panels.forEach( ( areaModel, index ) => {
            areaModel.htmlLabel = localize( features.areas[ index ].i18nHtmlLabel );
         } );
      }
   } ).localizer();

   $scope.model.panels = features.areas.map( createPanelModel );

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   $scope.eventBus.subscribe( 'beginLifecycleRequest', () => {
      $scope.model.panels.forEach( ( panel, i ) => {
         publishFlagIfConfigured( i, $scope.model.selectedPanel === i );
      } );
   } );

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   visibility.updateAreaVisibility( visibilityByArea() );

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function visibilityByArea() {
      const result = {};
      const { selectedPanel } = $scope.model;
      $scope.model.panels.forEach( ( panel, i ) => {
         result[ panel.areaName ] = i === selectedPanel;
      } );
      return result;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createPanelModel( area, index ) {

      const areaModel = {
         areaName: area.name,
         htmlLabel: localize( area.i18nHtmlLabel ),
         classes: {
            'ax-anonymize-me': area.anonymize,
            disabled: false,
            error: false,
            active: index === $scope.model.selectedPanel
         }
      };

      configureFlagHandler( area.validOn, valid => {
         areaModel.classes.error = !valid;
      } );
      configureFlagHandler( area.disabledOn, disabled => {
         areaModel.classes.disabled = disabled;
      } );
      configureFlagHandler( area.taggedOn, tagged => {
         areaModel.classes[ 'is-tagged' ] = tagged;
      } );

      if( area.selectionRequestTrigger && area.selectionRequestTrigger.onActions ) {
         area.selectionRequestTrigger.onActions.forEach( action => {
            $scope.eventBus.subscribe( `takeActionRequest.${action}`,
               createSelectionRequestTriggerHandler( area, index ) );
         } );
      }

      if( area.selectionRequest && area.selectionRequest.confirmationAction ) {
         $scope.eventBus.subscribe(
            `takeActionRequest.${area.selectionRequest.confirmationAction}`,
            handleDidConfirmSelection
         );
      }

      return areaModel;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function setSelectedPanel( newIndex ) {
      const visibilityChanges = {};
      const previousIndex = $scope.model.selectedPanel;
      if( !isNaN( previousIndex ) ) {
         const previousPanel = $scope.model.panels[ previousIndex ];
         previousPanel.classes.active = false;
         publishFlagIfConfigured( previousIndex, false );
         visibilityChanges[ previousPanel.areaName ] = false;
      }

      if( !isNaN( newIndex ) ) {
         requestedPanelIndex = newIndex;
         const requestedPanel = $scope.model.panels[ newIndex ];
         publishFlagIfConfigured( newIndex, true );
         const action = requestedPanel.selection || null;
         if( action ) {
            $scope.eventBus.publish( `takeActionRequest.${action}`, { action } );
         }
         visibilityChanges[ requestedPanel.areaName ] = true;
      }

      if( !isNaN( previousIndex ) || !isNaN( newIndex ) ) {
         visibility.updateAreaVisibility( visibilityChanges ).then( () => {
            if( isNaN( requestedPanelIndex ) ) { return; }
            const requestedPanel = $scope.model.panels[ requestedPanelIndex ];
            requestedPanel.classes.active = true;
            $scope.model.selectedPanel = newIndex;
            allowNextPanelActivation = true;
         } );
      }
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createSelectionRequestTriggerHandler( areaFeatures, index ) {
      return function() {
         if( areaFeatures.selectionRequest && areaFeatures.selectionRequest.action ) {
            $scope.model.onBeforeActivate( index );
         }
         else {
            setSelectedPanel( index );
         }
      };
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function handleDidConfirmSelection() {
      if( requestedPanelIndex < 0 ) {
         log.debug( 'Received selection confirmation, but no panel selection was requested.' );
         return;
      }
      setSelectedPanel( requestedPanelIndex );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   $scope.model.onBeforeActivate = function( index ) {
      if( $scope.model.panels[ index ].classes.disabled ) {
         return false;
      }

      if( allowNextPanelActivation && index === requestedPanelIndex ) {
         requestedPanelIndex = -1;
         allowNextPanelActivation = false;
         // selection was already confirmed, allow UI to reflect it now:
         return true;
      }

      const { selectionRequest } = features.areas[ index ] || {};
      if( selectionRequest ) {
         const { action } = selectionRequest || {};
         requestedPanelIndex = index;
         $scope.eventBus.publish( `takeActionRequest.${action}`, { action } );
      }
      else {
         setSelectedPanel( index );
      }

      // wait for confirm and/or visibility propagation
      return false;
   };

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function configureFlagHandler( flag, handler ) {
      if( !flag ) { return; }
      const flagName = flag.replace( /^!/, '' );
      const isInverted = flagName !== flag;
      $scope.eventBus.subscribe( `didChangeFlag.${flagName}`, event => {
         handler( isInverted ? !event.state : event.state );
      } );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function publishFlagIfConfigured( areaIndex, state ) {
      const { flag } = features.areas[ areaIndex ];
      if( flag ) {
         $scope.eventBus.publish( `didChangeFlag.${flag}.${state}`, { flag, state } );
      }
   }

}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const name = ng.module( 'axAccordionWidget', [] )
   .controller( 'AxAccordionWidgetController', Controller ).name;
